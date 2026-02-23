'use client';

import { useTranslation } from 'react-i18next';

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();

  const toggleLanguage = () => {
    const newLang = i18n.language === 'zh' ? 'en' : 'zh';
    i18n.changeLanguage(newLang);
  };

  return (
    <button
      onClick={toggleLanguage}
      className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-600 hover:border-indigo-500 transition-colors text-sm font-medium"
    >
      {i18n.language === 'zh' ? 'EN' : '中文'}
    </button>
  );
}
