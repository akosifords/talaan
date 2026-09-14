import NavIcon from './NavIcon';
import { routes, sections, workspaceHref } from './workspaceRoutes';
import './WorkspaceShell.css';

export default function WorkspaceShell({ page, scope, identity, onAccount, signedIn, month, onMonth, action, children, busy, sampleReset }) {
  const route = routes[page];
  const siblings = Object.entries(routes).filter(([, item]) => item.parent === route.parent);
  const link = (id, label, className) => <a key={id} className={className} href={workspaceHref(scope, id)} aria-current={page === id ? 'page' : undefined}>{label}</a>;
  return <div className="workspace-shell" aria-busy={busy}>
    <a className="workspace-skip" href="#workspace-content" onClick={event => { event.preventDefault(); document.getElementById('workspace-content')?.focus(); }}>Skip to content</a>
    <aside className="workspace-sidebar" aria-label="Workspace sidebar">
      <a href="#home" className="workspace-brand"><span className="brand-mark" aria-hidden="true"/>talaan</a>
      <div className="workspace-identity"><span className="workspace-status-dot"/>{identity}</div>
      <nav className="workspace-primary" aria-label="Workspace navigation">{sections.map(section => <a key={section.id} href={workspaceHref(scope, section.defaultPage)} aria-current={route.parent === section.id ? 'page' : undefined}><NavIcon name={section.id}/><span>{section.label}</span></a>)}</nav>
      <div className="workspace-utilities"><span className="workspace-nav-label">YOUR WORKSPACE</span><nav aria-label="Account navigation">{['profile', 'settings', 'help', 'design-review'].map(id => link(id, routes[id].label))}</nav><button className="workspace-account" onClick={onAccount}>{signedIn ? 'Sign out' : 'Sign in'}<span aria-hidden="true">↗</span></button></div>
    </aside>
    <div className="workspace-main">
      <header className="workspace-header"><div><span className="workspace-eyebrow">{sections.find(section => section.id === route.parent)?.label || 'Account'}{route.preview ? ' / Sample preview' : ''}</span><h1>{route.title}.</h1></div><div className="workspace-header-actions">{route.period && <label><span className="sr-only">Budget month</span><input aria-label="Budget month" type="month" value={month} onChange={e => e.target.value && onMonth(e.target.value)}/></label>}{action}<a className="workspace-mobile-account" href={workspaceHref(scope,'more')} aria-label="Account and settings">Account</a>{page==='more'&&<button className="workspace-mobile-account" onClick={onAccount}>{signedIn?'Sign out':'Sign in'}</button>}</div></header>
      {siblings.length > 1 && <nav className="workspace-secondary" aria-label={`${route.parent === 'account' ? 'Account' : sections.find(section => section.id === route.parent)?.label} views`}>{siblings.filter(([id]) => id !== 'more').map(([id, item]) => link(id, item.label))}</nav>}
      <section id="workspace-content" tabIndex={-1} className="dashboard-page ledger-dashboard workspace-content" aria-label={route.title}>{sampleReset ? <div className="sample-reset-bar"><p>Sample household · September 13, 2026 · USD · edits reset on reload.</p><button className="text-action" onClick={sampleReset}>Reset sample</button></div> : route.preview && <p className="workspace-preview-note">Illustrative sample data · USD · {['budgets','scenarios','subscriptions','forecast','review'].includes(page) ? 'trial adjustments reset on reload.' : 'preview changes reset when leaving this page.'}</p>}{children}</section>
    </div>
  </div>;
}
