import  { createContext, useState, useEffect } from 'react';

type Theme = 'light' | 'dark'

interface ThemeContextType {
    theme : Theme , 
    setTheme : (theme : Theme) =>void;
};


const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider = () => {
  const [theme, setTheme] = useState<Theme>('light');

  // ذخیره‌سازی تم انتخاب شده در localStorage
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as Theme | null;
    if (savedTheme) {
      setTheme(savedTheme);
    } else {
      localStorage.setItem('theme', 'light');
    }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

//   return (
//     <ThemeContext.Provider value={{ theme, setTheme }}>
//       {children}
//     </ThemeContext.Provider>
//   );
};

export default ThemeContext;
