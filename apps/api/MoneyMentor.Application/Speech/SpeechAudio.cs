using System.Buffers.Binary;
using System.Text;

namespace MoneyMentor.Application.Speech;

// Accept only the canonical client format. Duration is derived from samples, never a client claim.
public static class SpeechAudio
{
    public const int MaxBytes = 44 + 16000 * 2 * 30;
    public static int Validate(byte[] wav)
    {
        if (wav.Length < 44 + 6400 || wav.Length > MaxBytes
            || Encoding.ASCII.GetString(wav, 0, 4) != "RIFF"
            || Encoding.ASCII.GetString(wav, 8, 8) != "WAVEfmt "
            || Encoding.ASCII.GetString(wav, 36, 4) != "data"
            || U32(wav, 4) != wav.Length - 8 || U32(wav, 16) != 16
            || U16(wav, 20) != 1 || U16(wav, 22) != 1
            || U32(wav, 24) != 16000 || U32(wav, 28) != 32000
            || U16(wav, 32) != 2 || U16(wav, 34) != 16
            || U32(wav, 40) != wav.Length - 44 || (wav.Length - 44) % 2 != 0)
            throw new SpeechTranscriptionException("invalid-audio");
        // Suppress digital silence and recordings without any sustained audible content.
        var audible = 0;
        for (var offset = 44; offset < wav.Length; offset += 2)
            if (Math.Abs((int)BinaryPrimitives.ReadInt16LittleEndian(wav.AsSpan(offset, 2))) >= 32) audible++;
        if (audible < 1920) throw new SpeechTranscriptionException("no-speech");
        return (wav.Length - 44) * 1000 / 32000;
    }
    private static ushort U16(byte[] bytes, int offset) => BinaryPrimitives.ReadUInt16LittleEndian(bytes.AsSpan(offset, 2));
    private static uint U32(byte[] bytes, int offset) => BinaryPrimitives.ReadUInt32LittleEndian(bytes.AsSpan(offset, 4));
}
