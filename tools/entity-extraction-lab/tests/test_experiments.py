"""Regression gates for new benchmark experiments; no model weights needed."""
from contextlib import nullcontext
from copy import deepcopy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from test_lab import SCHEMA, empty_prediction
from entity_lab.diagnostics import mistakes, paired_reports
from entity_lab.experiments import CatalogProvider, DESCRIPTIONS, catalog_mentions, compile_schemas, load_catalog
from entity_lab.providers import GlinerProvider, PredictionError
from entity_lab.runtime import ROOT
from entity_lab.scoring import load_cases, load_suite, score_case, summarize
from entity_lab.web import Jobs, find_report
from lab import main, parser


def report(predictions):
    rows = []
    for i, prediction in enumerate(predictions):
        expected = empty_prediction()
        rows.append({'id':str(i), 'slice':'test', 'text':'hello', 'repeat':0,
                     'expected':expected, 'prediction':prediction, 'error':None if prediction else 'error',
                     'score':score_case(expected, prediction, SCHEMA), 'latency_ms':10})
    return {'run_id':'test', 'status':'completed', 'mode':'benchmark', 'dataset_hash':'d',
            'schema_hash':'s', 'code_hash':'c', 'config':{}, 'rows':rows, 'summary':summarize(rows, SCHEMA)}


class DatasetTests(unittest.TestCase):
    def test_challenge_coverage_and_seed_unchanged(self):
        challenge = load_suite(ROOT, SCHEMA, 'challenge')
        seed = load_suite(ROOT, SCHEMA, 'seed')
        all_cases = load_suite(ROOT, SCHEMA, 'all')
        self.assertEqual((len(seed), len(challenge), len(all_cases)), (48, 96, 144))
        self.assertEqual(len({c['text'].casefold() for c in all_cases}), 144)
        self.assertEqual({c['expected']['classifications']['intent'] for c in challenge}, set(SCHEMA['classifications']['intent']))
        self.assertEqual({c['expected']['classifications']['category'] for c in challenge}, set(SCHEMA['classifications']['category']))
        from collections import Counter
        self.assertEqual(set(Counter(c['slice'] for c in challenge).values()), {8})
        self.assertEqual(all_cases[:48], seed)

    def test_slice_filter_and_custom_dataset(self):
        rows = load_suite(ROOT, SCHEMA, 'challenge', slices=['card_purchase','card_repayment'])
        self.assertEqual(len(rows), 16)
        with self.assertRaisesRegex(ValueError, 'Unknown slices'):
            load_suite(ROOT, SCHEMA, 'challenge', slices=['typo-in-name'])
        self.assertEqual(len(load_suite(ROOT, SCHEMA, dataset=ROOT/'data/english.seed.jsonl')), 48)

    def test_gold_duplicate_must_have_source_occurrences(self):
        row = deepcopy(load_suite(ROOT, SCHEMA, 'seed')[0])
        row['expected']['entities']['amount'] *= 2
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/'bad.jsonl'
            path.write_text(json.dumps(row), encoding='utf-8')
            with self.assertRaisesRegex(ValueError, 'too many times'):
                load_cases(path, SCHEMA)
            path.write_text('[]', encoding='utf-8')
            with self.assertRaisesRegex(ValueError, 'object'):
                load_cases(path, SCHEMA)

    def test_cli_disallows_ambiguous_dataset_selection(self):
        args = parser().parse_args(['benchmark','--suite','challenge','--profile','split','--slice','card_purchase'])
        self.assertEqual(args.slices, ['card_purchase'])
        self.assertEqual(args.profile, 'split')
        from contextlib import redirect_stderr
        import io
        with redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            parser().parse_args(['benchmark','--suite','all','--dataset','some.jsonl'])


class ExperimentTests(unittest.TestCase):
    def test_compiled_profiles_keep_labels_and_separate_task_calls(self):
        class Builder:
            def __init__(self): self.tasks = {}
            def entities(self, entities): self.tasks['entities'] = entities; return self
            def classification(self, task, labels): self.tasks[task] = labels; return self
        class Model:
            def create_schema(self): return Builder()
        for profile in ('labels','descriptions','split'):
            compiled = compile_schemas(Model(), SCHEMA, profile)
            self.assertEqual(len(compiled), 3 if profile == 'split' else 1)
            tasks = {k:v for c in compiled for k,v in c.tasks.items()}
            for task, labels in SCHEMA['classifications'].items():
                self.assertEqual(list(tasks[task]), labels)
                self.assertIsInstance(tasks[task], list if profile == 'labels' else dict)
            self.assertEqual(tasks['entities'], SCHEMA['entities'])
        self.assertEqual(set(DESCRIPTIONS['category']), set(SCHEMA['classifications']['category']))
        changed = deepcopy(SCHEMA); changed['classifications']['intent'].append('new')
        with self.assertRaisesRegex(ValueError, 'bundled'):
            compile_schemas(Model(), changed, 'descriptions')

    def test_split_uses_same_model_and_does_not_erase_entities(self):
        class Torch:
            inference_mode = staticmethod(nullcontext)
        class Model:
            def __init__(self): self.calls=[]
            def extract(self, text, schema, **kwargs):
                self.calls.append(schema)
                return ({'entities':{'amount':['80']}},
                        {'entities':{},'intent':{'label':'expense'}},
                        {'entities':{},'category':{'label':'Cafes / Coffee'}})[schema]
        provider = GlinerProvider.__new__(GlinerProvider)
        provider.model, provider.torch = Model(), Torch()
        provider.schema, provider.compiled, provider.threshold = SCHEMA, [0,1,2], .5
        value, raw, _ = provider.extract('Coffee 80')
        self.assertEqual(value['entities']['amount'], ['80'])
        self.assertEqual(value['classifications']['intent'], 'expense')
        self.assertEqual(provider.model.calls, [0,1,2])
        self.assertEqual(len(raw['passes']), 3)
        provider.compiled = [0,1]  # missing category is a failure, not a partial success
        with self.assertRaises(PredictionError):
            provider.extract('Coffee 80')

    def test_catalog_longest_matches_ambiguity_and_boundaries(self):
        catalog = [{'id':'a','aliases':['HDFC credit card','HDFC credit card ending 1234','travel card']},
                   {'id':'b','aliases':['travel card']}]
        text = 'HDFC credit card ending 1234 and HDFC credit card; travel card; HDFC credit cards'
        matches = catalog_mentions(text, catalog)
        self.assertEqual([m['text'] for m in matches], ['HDFC credit card ending 1234','HDFC credit card'])
        self.assertTrue(all(text[m['start']:m['end']] == m['text'] for m in matches))
        # An ambiguous longer alias must block a shorter unique nested alias.
        catalog = [{'id':'a','aliases':['card','travel card']},{'id':'b','aliases':['travel card']}]
        self.assertEqual(catalog_mentions('travel card', catalog), [])

    def test_demo_catalog_does_not_invent_accounts_for_named_merchants(self):
        catalog = load_catalog(ROOT/'data/accounts.demo.json')
        for case in load_suite(ROOT, SCHEMA, 'challenge', slices=['account_collision']):
            self.assertEqual([m['text'] for m in catalog_mentions(case['text'], catalog)], case['expected']['entities']['account'])
        self.assertEqual(catalog_mentions('Milk 68 using travel card.', catalog), [])

    def test_catalog_union_preserves_duplicates_and_false_positives(self):
        value = empty_prediction(); value['entities']['account'] = ['ICICI card','wrong account']
        class Provider:
            metadata = {'model_id':'test'}
            def extract(self, text): return value, {'original':True}, {}
        provider = CatalogProvider(Provider(), [{'id':'i','aliases':['ICICI card']}])
        prediction, raw, _ = provider.extract('ICICI card to ICICI card')
        self.assertEqual(prediction['entities']['account'], ['ICICI card','wrong account','ICICI card'])
        self.assertEqual(value['entities']['account'], ['ICICI card','wrong account'])
        self.assertEqual(len(raw['catalog_matches']), 2)
        self.assertIn('account_catalog_hash', provider.metadata)

    def test_invalid_catalog_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/'accounts.json'
            for value in ([], {}, [{'id':'a','aliases':[]}], [{'id':'a','aliases':['x']},{'id':'a','aliases':['y']}]):
                path.write_text(json.dumps(value), encoding='utf-8')
                with self.assertRaises(ValueError): load_catalog(path)


class DiagnosticTests(unittest.TestCase):
    def test_analysis_cannot_overwrite_input(self):
        from contextlib import redirect_stderr
        import io
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/'report.json'
            original = json.dumps(report([empty_prediction()]))
            path.write_text(original, encoding='utf-8')
            with redirect_stderr(io.StringIO()):
                self.assertEqual(main(['failures',str(path),'--output',str(path)]),1)
            self.assertEqual(path.read_text(encoding='utf-8'), original)

    def test_pairing_counts_wins_and_regressions_once(self):
        good = empty_prediction(); wrong = deepcopy(good); wrong['classifications']['intent']='expense'
        left, right = report([wrong,good,good,None]), report([good,wrong,good,None])
        right['rows'].append({**deepcopy(right['rows'][0]), 'repeat':1})
        result = paired_reports(left, right)
        self.assertEqual(result['cases'], 4)
        self.assertEqual(result['changes']['all_exact'], {'improved':['0'], 'regressed':['1'], 'both_correct':1,'both_wrong':1,'accuracy_delta':0})
        self.assertEqual(result['changes']['amount']['improved'], [])
        self.assertEqual([m['id'] for m in result['regressions']], ['1'])
        self.assertEqual([m['id'] for m in mistakes(right)], ['1','3'])

    def test_pairing_rejects_incompatible_or_tampered_cases(self):
        left = report([empty_prediction()])
        for key in ('dataset_hash','schema_hash','code_hash'):
            right=deepcopy(left); right[key]='different'
            with self.assertRaisesRegex(ValueError,'differs'): paired_reports(left,right)
        right=deepcopy(left);right['rows'][0]['text']='changed'
        with self.assertRaisesRegex(ValueError,'gold differs'): paired_reports(left,right)
        right=deepcopy(left);right['rows'][0]['id']='other'
        with self.assertRaisesRegex(ValueError,'same case IDs'): paired_reports(left,right)

    def test_confusion_errors_and_noncreation_routing(self):
        good=empty_prediction(); wrong=deepcopy(good);wrong['classifications']['intent']='expense'
        result=report([wrong,None,good])['summary']
        self.assertEqual(result['false_creation_intent'], {'cases':3,'count':1,'rate':1/3})
        cells=result['confusion']['intent']
        self.assertIn({'expected':'not_transaction','predicted':'<error>','count':1},cells)
        self.assertEqual(result['slices']['test']['classifications']['intent'],1/3)
        self.assertIsNone(result['slices']['test']['entity_micro']['f1'])

    def test_web_passes_allowlisted_settings_and_blocks_paths(self):
        jobs=Jobs()
        with tempfile.TemporaryDirectory() as directory:
            jobs.log_path=Path(directory)/'worker.log'
            with patch('entity_lab.web.subprocess.Popen') as popen:
                jobs.start({'model':'gliner-small','mode':'benchmark','profile':'split','suite':'challenge','repeats':1,'catalog':True})
                command=popen.call_args.args[0]
                self.assertEqual(command[command.index('--profile')+1], 'split')
                self.assertEqual(command[command.index('--suite')+1], 'challenge')
                self.assertIn('--account-catalog',command)
                jobs.process=None
                jobs.stop()
                with self.assertRaises(ValueError): jobs.start({'model':'gliner-small','mode':'benchmark','suite':'../../private'})
        with self.assertRaises(ValueError): find_report('../../private')


if __name__=='__main__':
    unittest.main()
