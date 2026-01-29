import { useTranslation } from 'react-i18next';

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();

  const toggle = () => {
    const next = i18n.language === 'fi' ? 'en' : 'fi';
    i18n.changeLanguage(next);
    localStorage.setItem('language', next);
  };

  return (
    <button
      className="btn-sm lang-toggle"
      onClick={toggle}
      title={i18n.language === 'fi' ? 'Switch to English' : 'Vaihda suomeksi'}
    >
      {i18n.language === 'fi' ? '🇬🇧' : '🇫🇮'}
    </button>
  );
}
