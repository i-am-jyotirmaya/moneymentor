"use client";

import NextLink from "next/link";
import { useRouter } from "next/navigation";
import {
  ComponentProps,
  createContext,
  ReactNode,
  useContext,
  useMemo,
  useTransition,
} from "react";
import { LoadingBar } from "./loading-ui";

const NavigationContext = createContext<(action: () => void) => void>(
  (action) => action(),
);

export function NavigationProgress({ children }: { children: ReactNode }) {
  const [pending, startTransition] = useTransition();
  return (
    <NavigationContext.Provider value={startTransition}>
      <LoadingBar active={pending} />
      {children}
    </NavigationContext.Provider>
  );
}

export function useProgressRouter() {
  const router = useRouter();
  const startTransition = useContext(NavigationContext);
  return useMemo(
    () => ({
      ...router,
      push: (href: string) => startTransition(() => router.push(href)),
      replace: (href: string) => startTransition(() => router.replace(href)),
    }),
    [router, startTransition],
  );
}

export function ProgressLink(props: ComponentProps<typeof NextLink>) {
  const router = useRouter();
  const startTransition = useContext(NavigationContext);
  return (
    <NextLink
      {...props}
      onNavigate={(event) => {
        props.onNavigate?.(event);
        // Keep Next's native behavior for anchors and object-form hrefs.
        if (typeof props.href !== "string") return;
        const url = new URL(props.href, window.location.href);
        if (
          url.pathname === window.location.pathname &&
          url.search === window.location.search
        )
          return;
        event.preventDefault();
        startTransition(() => {
          if (props.replace)
            router.replace(props.href as string, { scroll: props.scroll });
          else router.push(props.href as string, { scroll: props.scroll });
        });
      }}
    />
  );
}
