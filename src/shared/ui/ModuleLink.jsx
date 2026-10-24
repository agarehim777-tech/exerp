import { Link, useInRouterContext } from 'react-router-dom';

export default function ModuleLink({ to, onSelect, children, ...props }) {
  const inRouter = useInRouterContext();
  const onClick = event => {
    if (onSelect && event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      onSelect();
    }
  };
  if (inRouter) return <Link {...props} to={to} onClick={onClick}>{children}</Link>;
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
  return <a {...props} href={`${base}${to}`} onClick={onClick}>{children}</a>;
}
