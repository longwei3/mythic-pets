import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en';
import zh from './locales/zh';

export const LANGUAGE_STORAGE_KEY = 'mythicpets-lang';

function detectLanguage(): 'en' | 'zh' {
  if (typeof window === 'undefined') {
    return 'en';
  }

  const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (saved === 'en' || saved === 'zh') {
    return saved;
  }

  return window.navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    zh: { translation: zh },
  },
  lng: detectLanguage(),
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
