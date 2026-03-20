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
import { Avatar } from '../ui/Avatar';

const languages = [
  { code: 'en', label: 'English' },
  { code: 'ru', label: 'Русский' },
] as const;

const navItems = [
  { to: '/', icon: Home, label: 'nav.home', index: '01' },
  { to: '/search', icon: Search, label: 'nav.search', index: '02' },
  { to: '/library', icon: Library, label: 'nav.library', index: '03' },
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
      className="shrink-0 border-r border-white/[0.06] bg-[linear-gradient(180deg,rgba(10,11,15,0.9),rgba(8,8,11,0.72))] px-3 py-4 transition-[width] duration-200 ease-[var(--ease-apple)]"
      style={{ width: collapsed ? 88 : 272 }}
    >
      <div className="flex h-full flex-col">
        <div className={`mb-6 ${collapsed ? 'px-1' : 'px-2'}`}>
          <div className={`surface-panel-muted rounded-[24px] ${collapsed ? 'p-2.5' : 'p-4'}`}>
            <p className={`eyebrow ${collapsed ? 'text-center' : ''}`}>Browse</p>
            {!collapsed && (
              <>
                <h2 className="mt-2 text-[18px] font-bold text-white/92 text-balance">
                  Collected Sound, Reframed.
                </h2>
                <p className="mt-2 text-[12px] leading-5 text-white/46">
                  Faster artwork, native playback, and a cleaner path through your library.
                </p>
              </>
            )}
          </div>
        </div>

        <nav className="flex flex-col gap-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              title={collapsed ? t(item.label) : undefined}
              className={({ isActive }) =>
                `group flex items-center rounded-[22px] border px-3 py-3 transition-colors duration-200 ${
                  collapsed ? 'justify-center' : 'gap-3'
                } ${
                  isActive
                    ? 'border-white/[0.12] bg-white/[0.07] text-white'
                    : 'border-transparent bg-transparent text-white/42 hover:border-white/[0.06] hover:bg-white/[0.04] hover:text-white/78'
                }`
              }
            >
              <item.icon size={18} strokeWidth={1.8} />
              {!collapsed && (
                <>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold">{t(item.label)}</p>
                    <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.24em] text-white/24">
                      Route {item.index}
                    </p>
                  </div>
                  <span className="section-index">{item.index}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {!collapsed && (
          <div className="mt-6 flex flex-wrap gap-2 px-1">
            <span className="command-chip">play</span>
            <span className="command-chip">collect</span>
            <span className="command-chip">move</span>
          </div>
        )}

        <div className="mt-auto space-y-2 pt-6">
          <button
            type="button"
            onClick={toggleSidebar}
            title={collapsed ? t('nav.expand') : undefined}
            aria-label={collapsed ? t('nav.expand') : t('nav.collapse')}
            className={`flex w-full items-center rounded-[20px] px-3 py-3 text-[12px] font-medium text-white/42 transition-colors duration-200 hover:bg-white/[0.04] hover:text-white/72 ${
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
            className={`flex w-full items-center rounded-[20px] px-3 py-3 text-[12px] font-medium text-white/42 transition-colors duration-200 hover:bg-white/[0.04] hover:text-white/72 ${
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
              `flex w-full items-center rounded-[20px] px-3 py-3 text-[12px] font-medium transition-colors duration-200 ${
                collapsed ? 'justify-center' : 'gap-3'
              } ${
                isActive
                  ? 'bg-white/[0.07] text-white/80'
                  : 'text-white/42 hover:bg-white/[0.04] hover:text-white/72'
              }`
            }
          >
            <Settings size={16} strokeWidth={1.8} />
            {!collapsed && <span>{t('nav.settings')}</span>}
          </NavLink>

          {user && (
            <NavLink
              to={`/user/${encodeURIComponent(user.urn)}`}
              title={collapsed ? user.username : undefined}
              className={({ isActive }) =>
                `surface-panel-muted flex items-center rounded-[24px] p-3 transition-colors duration-200 ${
                  collapsed ? 'justify-center' : 'gap-3'
                } ${isActive ? 'border-white/[0.12]' : 'hover:border-white/[0.1]'}`
              }
            >
              <Avatar src={user.avatar_url} alt={user.username} size={collapsed ? 34 : 38} />
              {!collapsed && (
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-white/88">
                    {user.username}
                  </p>
                  <p className="mt-1 text-[10px] uppercase tracking-[0.22em] text-white/28">
                    Profile
                  </p>
                </div>
              )}
            </NavLink>
          )}
        </div>
      </div>
    </aside>
  );
});
