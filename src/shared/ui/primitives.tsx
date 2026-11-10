import type { ButtonHTMLAttributes, ChangeEventHandler, FormEventHandler, HTMLAttributes, InputHTMLAttributes, KeyboardEvent, ReactNode, SelectHTMLAttributes } from 'react';
export { default as DataTable } from './DataTable.tsx';

const join = (...values: Array<string | false | undefined>) => values.filter(Boolean).join(' ');
type ContainerProps = HTMLAttributes<HTMLElement> & { children?: ReactNode };

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'tab';
  size?: 'compact';
}
export function Button({ variant = 'primary', size, className, type = 'button', ...rest }: ButtonProps) {
  return <button type={type} className={join('ui-button', `ui-button-${variant}`, size && `ui-button-${size}`, className)} {...rest} />;
}

export interface CardProps extends Omit<ContainerProps, 'title'> {
  title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; as?: 'section' | 'article' | 'div';
}
export function Card({ title, subtitle, actions, children, className, as: Tag = 'section', ...rest }: CardProps) {
  return <Tag className={join('ui-card', className)} {...rest}>
    {(title || subtitle || actions) && <header className="ui-card-header"><div>{title && <h3>{title}</h3>}{subtitle && <p>{subtitle}</p>}</div>{actions && <div className="ui-card-actions">{actions}</div>}</header>}
    {children}
  </Tag>;
}
export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) { return <input className={join('ui-input', className)} {...rest} />; }
export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) { return <select className={join('ui-input', className)} {...rest}>{children}</select>; }
export function Field({ label, children, className }: ContainerProps & { label: ReactNode }) { return <label className={join('ui-field', className)}><span>{label}</span>{children}</label>; }
export function PageStack({ children, className }: ContainerProps) { return <div className={join('ui-page-stack', className)}>{children}</div>; }
export function Toolbar({ children, className }: ContainerProps) { return <div className={join('ui-toolbar', className)}>{children}</div>; }
export interface FormGridProps extends Omit<ContainerProps, 'onSubmit' | 'onChange'> {
  as?: 'div' | 'form'; onSubmit?: FormEventHandler<HTMLFormElement>; onChange?: ChangeEventHandler<HTMLFormElement>;
}
export function FormGrid({ children, className, as = 'div', onSubmit, onChange, ...rest }: FormGridProps) {
  return as === 'form' ? <form className={join('ui-form-grid', className)} onSubmit={onSubmit} onChange={onChange} {...rest}>{children}</form>
    : <div className={join('ui-form-grid', className)} {...rest}>{children}</div>;
}
export function StatGrid({ children, className }: ContainerProps) { return <section className={join('ui-stat-grid', className)}>{children}</section>; }
export function StatCard({ label, value, tone = 'default' }: { label: ReactNode; value: ReactNode; tone?: string }) { return <article className={join('ui-stat-card', `ui-tone-${tone}`)}><span>{label}</span><strong>{value}</strong></article>; }
export function Tabs({ items, value, onChange, className }: { items: Array<[string, ReactNode]>; value: string; onChange: (value: string) => void; className?: string }) {
  const move = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!items.length) return;
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + delta + items.length) % items.length;
    if (!delta && !['Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const target = event.currentTarget.parentElement?.children[next];
    if (target instanceof HTMLElement) target.focus();
    const item = items[next];
    if (item) onChange(item[0]);
  };
  return <div className={join('ui-tabs', className)} role="tablist">{items.map(([key, label], index) => <Button key={key} variant="tab" className={value === key ? 'active' : ''} role="tab" aria-selected={value === key} tabIndex={value === key ? 0 : -1} onKeyDown={event => move(event, index)} onClick={() => onChange(key)}>{label}</Button>)}</div>;
}
export function Notice({ children, tone = 'info', className }: ContainerProps & { tone?: string }) { return <div className={join('ui-notice', `ui-notice-${tone}`, className)} role={tone === 'danger' ? 'alert' : undefined}>{children}</div>; }
export function Badge({ children, tone = 'neutral', className }: ContainerProps & { tone?: string }) { return <span className={join('ui-badge', `ui-badge-${tone}`, className)}>{children}</span>; }
export function TableActions({ children }: { children?: ReactNode }) { return <div className="ui-table-actions">{children}</div>; }