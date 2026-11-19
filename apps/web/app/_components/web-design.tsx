"use client";

import { createContext, useContext } from "react";

// Capacitor also imports web components, but mounts its own root layout.
const SpndrrWebContext = createContext(false);

export function SpndrrWebDesign({ children }: { children: React.ReactNode }) {
  return <SpndrrWebContext.Provider value>{children}</SpndrrWebContext.Provider>;
}

export function useSpndrrWeb() {
  return useContext(SpndrrWebContext);
}
