"use client";

import { CommandPalette } from "./CommandPalette";

export function GlobalProviders({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <CommandPalette />
    </>
  );
}
