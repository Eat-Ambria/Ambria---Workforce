import { createContext, useContext } from "react";
import { C } from "./constants.js";

// Provides the active theme colour object (same keys as C) to the whole tree.
// Falls back to the light theme (C) if used outside a provider.
export const ThemeContext = createContext(C);
export const useT = () => useContext(ThemeContext);
