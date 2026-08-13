import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { pageMeta } from "../config/page-meta.js";
import { moduleRoutes } from "../config/routes.js";

const SITE_NAME = "Expert ERP";
const BASE_TITLE = "Expert ERP — Çoxşirkətli ERP və CRM platforması";
const BASE_DESCRIPTION =
  "Expert ERP — Azərbaycan bizneslər üçün çoxşirkətli ERP və CRM platforması: satış, anbar, maliyyə, mühasibat və HR bir sistemdə.";

const PUBLIC_META = {
  "/login": {
    title: "Sistemə giriş",
    description:
      "Expert ERP hesabınıza daxil olun və şirkətinizin satış, anbar, maliyyə və CRM əməliyyatlarını idarə edin.",
  },
};

function pathToModule(pathname) {
  const clean = pathname.replace(/\/+$/, "") || "/";
  let match = null;
  for (const [moduleId, route] of Object.entries(moduleRoutes)) {
    if (route === clean) return moduleId;
    if (clean.startsWith(`${route}/`) && (!match || route.length > moduleRoutes[match].length)) {
      match = moduleId;
    }
  }
  return match;
}

function upsertMeta(selector, attr, name, content) {
  let el = document.head.querySelector(selector);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertLink(rel, href) {
  let el = document.head.querySelector(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

function clamp(value, max) {
  const text = String(value || "").trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/**
 * Keeps title, description, canonical and Open Graph tags in sync with the
 * active route so every module is indexable as a distinct page.
 */
export default function RouteMeta() {
  const { pathname } = useLocation();

  useEffect(() => {
    const publicMeta = PUBLIC_META[pathname.replace(/\/+$/, "") || "/"];
    const moduleId = pathToModule(pathname);
    const meta = publicMeta || (moduleId ? pageMeta[moduleId] : null);

    const isHome = (pathname.replace(/\/+$/, "") || "/") === "/";
    const title = isHome || !meta?.title ? BASE_TITLE : clamp(`${meta.title} — ${SITE_NAME}`, 60);
    const rawDescription = publicMeta?.description || meta?.subtitle || BASE_DESCRIPTION;
    const description = clamp(
      rawDescription.length < 50 ? `${rawDescription} ${BASE_DESCRIPTION}` : rawDescription,
      158,
    );
    const url = `${window.location.origin}${pathname}`;

    document.title = title;
    upsertMeta('meta[name="description"]', "name", "description", description);
    upsertMeta('meta[property="og:title"]', "property", "og:title", title);
    upsertMeta('meta[property="og:description"]', "property", "og:description", description);
    upsertMeta('meta[property="og:url"]', "property", "og:url", url);
    upsertMeta('meta[property="og:site_name"]', "property", "og:site_name", SITE_NAME);
    upsertMeta('meta[name="twitter:title"]', "name", "twitter:title", title);
    upsertMeta('meta[name="twitter:description"]', "name", "twitter:description", description);
    upsertLink("canonical", url);
  }, [pathname]);

  return null;
}
