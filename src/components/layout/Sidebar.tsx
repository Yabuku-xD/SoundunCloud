import React from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';
import {
  Globe,
  Home,
  Library,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
} from '../../lib/icons';
import { useAuthStore } from '../../stores/auth';
import { useSettingsStore } from '../../stores/settings';
import { SidebarUpdateCard } from '../UpdateChecker';
import { Avatar } from '../ui/Avatar';

const languages = [
  { code: 'en', label: 'English' },
  { code: 'ru', label: 'Русский' },
] as const;

const navItems = [
  { to: '/', icon: Home, label: 'nav.home' },
  { to: '/search', icon: Search, label: 'nav.search' },
  { to: '/library', icon: Library, label: 'nav.library' },
];

export const Sidebar = React.memo(() => {
  const { t, i18n } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const collapsed = useSettingsStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useSettingsStore((s) => s.toggleSidebar);

  const toggleLanguage = () => {
    const next = i18n.language === 'ru' ? 'en' : 'ru';
    i18n.changeLanguage(next);
  };

  const currentLang = languages.find((l) => l.code === i18n.language) ?? languages[0];

  return (
    <aside
      className="shrink-0 border-r border-white/[0.05] bg-[linear-gradient(180deg,rgba(8,9,13,0.88),rgba(7,7,10,0.72))] px-3 py-4 transition-[width] duration-200 ease-[var(--ease-apple)]"
      style={{ width: collapsed ? 84 : 216 }}
    >
      <div className="flex h-full flex-col">
        <nav className="flex flex-col gap-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              title={collapsed ? t(item.label) : undefined}
              className={({ isActive }) =>
                `flex items-center rounded-[18px] px-3 py-3 text-[13px] font-medium transition-colors duration-200 ${
                  collapsed ? 'justify-center' : 'gap-3'
                } ${
                  isActive
                    ? 'bg-white/[0.08] text-white'
                    : 'text-white/42 hover:bg-white/[0.04] hover:text-white/78'
                }`
              }
            >
              <item.icon size={18} strokeWidth={1.8} />
              {!collapsed && <span>{t(item.label)}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto space-y-2 pt-6">
          <button
            type="button"
            onClick={toggleSidebar}
            title={collapsed ? t('nav.expand') : undefined}
            aria-label={collapsed ? t('nav.expand') : t('nav.collapse')}
            className={`flex w-full items-center rounded-[18px] px-3 py-3 text-[12px] font-medium text-white/42 transition-colors duration-200 hover:bg-white/[0.04] hover:text-white/72 ${
              collapsed ? 'justify-center' : 'gap-3'
            }`}
          >
            {collapsed ? (
              <PanelLeftOpen size={16} strokeWidth={1.8} />
            ) : (
              <PanelLeftClose size={16} strokeWidth={1.8} />
            )}
            {!collapsed && <span>{t('nav.collapse')}</span>}
          </button>

          <button
            type="button"
            onClick={toggleLanguage}
            title={collapsed ? currentLang.label : undefined}
            aria-label={`Switch language. Current language ${currentLang.label}`}
            className={`flex w-full items-center rounded-[18px] px-3 py-3 text-[12px] font-medium text-white/42 transition-colors duration-200 hover:bg-white/[0.04] hover:text-white/72 ${
              collapsed ? 'justify-center' : 'gap-3'
            }`}
          >
            <Globe size={16} strokeWidth={1.8} />
            {!collapsed && <span>{currentLang.label}</span>}
          </button>

          <NavLink
            to="/settings"
            title={collapsed ? t('nav.settings') : undefined}
            className={({ isActive }) =>
              `flex w-full items-center rounded-[18px] px-3 py-3 text-[12px] font-medium transition-colors duration-200 ${
                collapsed ? 'justify-center' : 'gap-3'
              } ${
                isActive
                  ? 'bg-white/[0.08] text-white/80'
                  : 'text-white/42 hover:bg-white/[0.04] hover:text-white/72'
              }`
            }
          >
            <Settings size={16} strokeWidth={1.8} />
            {!collapsed && <span>{t('nav.settings')}</span>}
          </NavLink>

          {user && (
            <>
              <NavLink
                to={`/user/${encodeURIComponent(user.urn)}`}
                title={collapsed ? user.username : undefined}
                className={({ isActive }) =>
                  `flex items-center rounded-[22px] px-3 py-3 transition-colors duration-200 ${
                    collapsed ? 'justify-center' : 'gap-3'
                  } ${isActive ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04]'}`
                }
              >
                <Avatar src={user.avatar_url} alt={user.username} size={collapsed ? 34 : 36} />
                {!collapsed && (
                  <span className="min-w-0 truncate text-[13px] font-medium text-white/82">
                    {user.username}
                  </span>
                )}
              </NavLink>

              <SidebarUpdateCard collapsed={collapsed} />
            </>
          )}
        </div>
      </div>
    </aside>
  );
});
