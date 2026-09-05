"use client";

import { createContext, useContext, useEffect, useState, useMemo, ReactNode } from "react";
import { ThemeProvider as MuiThemeProvider, createTheme, CssBaseline } from "@mui/material";

interface ThemeContextValue {
  dark: boolean;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({ dark: false, toggle: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("darkMode");
    setDark(saved === "true");
  }, []);

  useEffect(() => {
    localStorage.setItem("darkMode", String(dark));
  }, [dark]);

  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: dark ? "dark" : "light",
          primary: { main: "#6750a4" },
          secondary: { main: "#625b71" },
        },
        shape: { borderRadius: 12 },
        typography: {
          fontFamily:
            "Roboto, system-ui, -apple-system, 'Segoe UI', sans-serif",
        },
      }),
    [dark]
  );

  return (
    <ThemeContext.Provider value={{ dark, toggle: () => setDark((d) => !d) }}>
      <MuiThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </MuiThemeProvider>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}