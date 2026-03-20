import React from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  Disc3,
  Home,
  Library,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings,
} from '../../lib/icons';
import { useAuthStore } from '../../stores/auth';
import { useSettingsStore } from '../../stores/settings';
import { SidebarUpdateCard } from '../UpdateChecker';
import { Avatar } from '../ui/Avatar';

const navItems = [
  { to: '/', icon: Home, label: 'nav.home', group: 'Discover' },
  { to: '/search', icon: Search, label: 'nav.search', group: 'Discover' },
  { to: '/library', icon: Library, label: 'nav.library', group: 'Collection' },
];

function SectionLabel({ children, light }: { children: React.ReactNode; light: boolean }) {
  return (
    <p
      className={`px-3 text-[10px] font-semibold uppercase tracking-[0.18em] ${
        light ? 'text-[#a095b8]' : 'text-white/28'
      }`}
    >
      {children}
    </p>
  );
}

export const Sidebar = React.memo(({ tone = 'dark' }: { tone?: 'light' | 'dark' }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const collapsed = useSettingsStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useSettingsStore((state) => state.toggleSidebar);
  const light = tone === 'light';

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center rounded-[20px] px-3 py-3 text-[13px] font-medium transition-all duration-200 ${
      collapsed ? 'justify-center' : 'gap-3'
    } ${
      light
        ? isActive
          ? 'bg-white text-[#2f2442] shadow-[0_10px_26px_rgba(181,172,216,0.24)]'
          : 'text-[#6f6387] hover:bg-white/70 hover:text-[#2f2442]'
        : isActive
          ? 'bg-white/[0.08] text-white'
          : 'text-white/42 hover:bg-white/[0.04] hover:text-white/78'
    }`;

  return (
    <aside
      className={`shrink-0 rounded-[32px] px-3 py-4 transition-[width] duration-200 ease-[var(--ease-apple)] ${
        light
          ? 'border border-[#e7def3] bg-[linear-gradient(180deg,rgba(245,241,252,0.96),rgba(238,233,248,0.92))] shadow-[0_24px_70px_rgba(191,181,226,0.22)]'
          : 'border-r border-white/[0.05] bg-[linear-gradient(180deg,rgba(8,9,13,0.88),rgba(7,7,10,0.72))]'
      }`}
      style={{ width: collapsed ? 88 : 236 }}
    >
      <div className="flex h-full flex-col">
        <div className={`px-3 pb-5 ${collapsed ? 'flex justify-center' : ''}`}>
          <button
            type="button"
            onClick={() => navigate('/')}
            className={`flex items-center rounded-[24px] text-left ${collapsed ? 'justify-center' : 'gap-3'}`}
          >
            <div
              className={`flex h-11 w-11 items-center justify-center rounded-[18px] ${
                light ? 'bg-[#fff7f2] text-accent shadow-[0_10px_24px_rgba(255,119,64,0.18)]' : 'bg-accent/[0.14] text-accent'
              }`}
            >
              <Disc3 size={18} strokeWidth={2} />
            </div>
            {!collapsed && (
              <div>
                <p className={`text-[13px] font-semibold ${light ? 'text-[#312649]' : 'text-white/84'}`}>
                  SoundunCloud
                </p>
                <p className={`mt-0.5 text-[11px] ${light ? 'text-[#8b80a2]' : 'text-white/34'}`}>
                  Desktop mix
                </p>
              </div>
            )}
          </button>
        </div>

        <div className="space-y-4">
          {!collapsed && <SectionLabel light={light}>Discover</SectionLabel>}
          <nav className="space-y-1.5">
            {navItems.map((item) => (
              <NavLink key={item.to} to={item.to} title={collapsed ? t(item.label) : undefined} className={navClass}>
                <item.icon size={18} strokeWidth={1.8} />
                {!collapsed && <span>{t(item.label)}</span>}
              </NavLink>
            ))}
          </nav>

          {!collapsed && (
            <div className="px-3">
              <button
                type="button"
                onClick={() => navigate('/library')}
                className="flex w-full items-center justify-center gap-2 rounded-[18px] bg-[#d7c4ff] px-3 py-3 text-[12px] font-semibold text-[#4f356b] transition-colors duration-200 hover:bg-[#cdb4ff]"
              >
                <Plus size={14} />
                <span>New Playlist</span>
              </button>
            </div>
          )}
        </div>

        <div className="mt-auto space-y-2 pt-6">
          <button
            type="button"
            onClick={toggleSidebar}
            title={collapsed ? t('nav.expand') : undefined}
            aria-label={collapsed ? t('nav.expand') : t('nav.collapse')}
            className={`flex w-full items-center rounded-[18px] px-3 py-3 text-[12px] font-medium transition-colors duration-200 ${
              collapsed ? 'justify-center' : 'gap-3'
            } ${
              light
                ? 'text-[#84789c] hover:bg-white/70 hover:text-[#3b2d55]'
                : 'text-white/42 hover:bg-white/[0.04] hover:text-white/72'
            }`}
          >
            {collapsed ? (
              <PanelLeftOpen size={16} strokeWidth={1.8} />
            ) : (
              <PanelLeftClose size={16} strokeWidth={1.8} />
            )}
            {!collapsed && <span>{t('nav.collapse')}</span>}
          </button>

          <NavLink
            to="/settings"
            title={collapsed ? t('nav.settings') : undefined}
            className={({ isActive }) =>
              `flex w-full items-center rounded-[18px] px-3 py-3 text-[12px] font-medium transition-colors duration-200 ${
                collapsed ? 'justify-center' : 'gap-3'
              } ${
                light
                  ? isActive
                    ? 'bg-white text-[#35284d]'
                    : 'text-[#84789c] hover:bg-white/70 hover:text-[#3b2d55]'
                  : isActive
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
                  } ${
                    light
                      ? isActive
                        ? 'bg-white shadow-[0_10px_24px_rgba(191,181,226,0.22)]'
                        : 'bg-white/55 hover:bg-white'
                      : isActive
                        ? 'bg-white/[0.08]'
                        : 'hover:bg-white/[0.04]'
                  }`
                }
              >
                <Avatar src={user.avatar_url} alt={user.username} size={collapsed ? 34 : 38} />
                {!collapsed && (
                  <div className="min-w-0">
                    <span className={`block truncate text-[13px] font-semibold ${light ? 'text-[#2f2442]' : 'text-white/82'}`}>
                      {user.username}
                    </span>
                    <span className={`mt-0.5 block text-[11px] ${light ? 'text-[#8c82a2]' : 'text-white/34'}`}>
                      Profile
                    </span>
                  </div>
                )}
              </NavLink>

              <SidebarUpdateCard collapsed={collapsed} tone={tone} />
            </>
          )}
        </div>
      </div>
    </aside>
  );
});
