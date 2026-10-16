import { ViewTransition } from "react";

/**
 * Every page arrives the same quiet way: the old one lifts and fades, the new
 * one settles in from just below. Shared elements (a project's name, say)
 * move between pages on their own (see WorkList and the project page).
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition enter="page" exit="page" default="none">
      {children}
    </ViewTransition>
  );
}
