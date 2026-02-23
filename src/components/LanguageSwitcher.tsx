'use client';

import { useTranslation } from 'react-i18next';

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();

  const currentLang = i18n.resolvedLanguage ?? i18n.language;
  const isChinese = currentLang.startsWith('zh');

  const toggleLanguage = () => {
    i18n.changeLanguage(isChinese ? 'en' : 'zh');
  };

  return (
    <button
      onClick={toggleLanguage}
      className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-600 hover:border-indigo-500 transition-colors text-sm font-medium"
    >
      {isChinese ? 'EN' : '中文'}
    </button>
  );
}
