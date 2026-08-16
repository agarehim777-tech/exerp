import { useState } from "react";
import { Boxes, Check, ShieldCheck } from "lucide-react";
import { StatusBadge, TwoLine } from "./ui.jsx";
import { navIcons } from "../config/navigation-icons.js";
import { changeRemotePassword } from "../remote-api.js";

export function PasswordChangeScreen({ user, onLogout }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    if (newPassword.length < 8 || newPassword !== confirmation) {
      setError("Yeni parol ən azı 8 simvol olmalı və təkrar ilə uyğun gəlməlidir.");
      return;
    }
    try {
      await changeRemotePassword(currentPassword, newPassword);
      window.location.reload();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Parol dəyişdirilmədi.");
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <ShieldCheck size={36} />
        <h1>Yeni parol təyin edin</h1>
        <p>{user.name}, təhlükəsizlik üçün ilkin parolu dəyişdirin.</p>
        <form className="login-form" onSubmit={submit}>
          <label><span>İlkin parol</span><input type="password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label>
          <label><span>Yeni parol</span><input type="password" required minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label>
          <label><span>Yeni parolun təkrarı</span><input type="password" required minLength={8} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>
          {error ? <div className="login-error">{error}</div> : null}
          <button type="submit" className="primary-btn">Parolu dəyiş</button>
          <button type="button" className="secondary-btn" onClick={onLogout}>Çıxış</button>
        </form>
      </div>
    </div>
  );
}

const companyModuleCopy = {
  dashboard: ["İdarəetmə paneli", "Əsas göstəricilər və ümumi əməliyyat icmalı"],
  crm: ["Müştərilər (CRM)", "Müştəri bazası, əlaqələr və 360° görünüş"],
  sales: ["Satış", "Sifarişlər, satış axını və bonuslar"],
  warehouse: ["Anbar və stok", "Qalıqlar, rezervlər və anbar əməliyyatları"],
  deliveries: ["Təhvil və logistika", "Çatdırılma mərhələləri və təhvil nəzarəti"],
  finance: ["Maliyyə", "Kassa, xərclər və maliyyə təsdiqləri"],
  invoices: ["Fakturalar və e-qaimə", "Faktura yaradılması və ödəniş izləmə"],
  accounting: ["Mühasibat", "Mühasibat yazılışları və maliyyə hesabatları"],
  tax: ["Vergi təqvimi", "Vergi öhdəlikləri və son tarixlər"],
  credits: ["Kreditlər", "Kredit satışları və ödəniş cədvəlləri"],
  receivables: ["Debitor və kreditor", "Alacaq və borc balanslarının idarəsi"],
  vendors: ["Təchizatçılar", "Vendorlar, kvotalar və satınalma əlaqələri"],
  projects: ["Layihələr və ROI", "Layihə gəlirliliyi və investisiya analizi"],
  production: ["İstehsalat", "İstehsal planları və material axını"],
  hr: ["İnsan resursları (HR)", "Əməkdaşlar, şöbələr və məzuniyyətlər"],
  kpi: ["KPI və performans", "Hədəflər, nəticələr və bonus hesablamaları"],
  contracts: ["Müqavilələr", "Müqavilə şablonları və sənədlər"],
  reports: ["Hesabatlar", "İdarəetmə hesabatları və export"],
  support: ["Dəstək", "Sorğular, tapşırıqlar və xidmət izləmə"],
  help: ["Kömək mərkəzi", "Təlimatlar və istifadəçi bələdçisi"],
  onboarding: ["İlkin quraşdırma", "Şirkətin sistemə qoşulma addımları"],
  messages: ["Daxili mesajlar", "Komanda daxilində yazışmalar"],
  notifications: ["Bildirişlər", "Sistem xəbərdarlıqları və avtomatlaşdırma"],
  api: ["API inteqrasiyaları", "Xarici sistemlər və webhook bağlantıları"],
  settings: ["Sistem ayarları", "İstifadəçilər, rollar və ümumi sazlamalar"],
};

export function CompanyModulePicker({ modules, value, onToggle }) {
  return (
    <div className="company-module-picker">
      {modules.map((module) => {
        const Icon = navIcons[module.id] || Boxes;
        const [label, description] = companyModuleCopy[module.id] || [module.label, "ERP modulu"];
        const selected = value.includes(module.id);
        const required = module.id === "dashboard";
        return (
          <label key={module.id} className="company-module-card">
            <input type="checkbox" checked={selected} disabled={required} onChange={() => onToggle(module.id)} />
            <span className="company-module-icon"><Icon size={18} /></span>
            <span className="company-module-copy"><strong>{label}</strong><small>{description}</small></span>
            <span className="company-module-state">{selected ? <Check size={16} /> : null}</span>
            {required ? <em>Məcburi</em> : null}
          </label>
        );
      })}
    </div>
  );
}

export function LoginScreen({ users = [], roles = [], onLogin, authMode = "local", onPasswordLogin, isLoading = false, authError = "" }) {
  const activeUsers = users.filter((user) => user.status === "Aktiv");
  const [selectedUserId, setSelectedUserId] = useState(activeUsers[0]?.id || "");
  const selectedUser = activeUsers.find((user) => user.id === selectedUserId) || activeUsers[0] || null;
  const selectedRole = roles.find((role) => role.name === selectedUser?.role);

  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="brand-mark login-brand">E</div>
        <div><h1>ERP+CRM AZ</h1><p>İstifadəçi seçin və rol icazələri ilə sistemə daxil olun.</p></div>
        {authMode === "password" ? <PasswordLoginForm onLogin={onPasswordLogin} isLoading={isLoading} error={authError} /> : (
          <>
            <label><span>İstifadəçi</span><select value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)}>{activeUsers.map((user) => <option key={user.id} value={user.id}>{user.name} · {user.role}</option>)}</select></label>
            {selectedUser && <div className="login-role-preview"><TwoLine title={selectedUser.email} subtitle={selectedRole?.scope || selectedUser.role} /><StatusBadge status={selectedUser.role} /></div>}
            <button className="primary-btn full" onClick={() => onLogin(selectedUserId)} disabled={!selectedUserId}><ShieldCheck size={16} />Sistemə daxil ol</button>
          </>
        )}
      </section>
    </main>
  );
}

function PasswordLoginForm({ onLogin, isLoading, error }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const submit = (event) => { event.preventDefault(); onLogin({ email, password }); };
  return (
    <form className="login-password-form" onSubmit={submit}>
      <label><span>Email</span><input type="email" autoComplete="username" value={email} required onChange={(event) => setEmail(event.target.value)} /></label>
      <label><span>Parol</span><input type="password" autoComplete="current-password" value={password} required onChange={(event) => setPassword(event.target.value)} /></label>
      {error && <p className="form-error">{error}</p>}
      <button className="primary-btn full" type="submit" disabled={isLoading}><ShieldCheck size={16} />{isLoading ? "Yoxlanılır..." : "Sistemə daxil ol"}</button>
    </form>
  );
}
