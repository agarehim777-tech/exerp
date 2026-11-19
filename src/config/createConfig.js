import { initialState, stages } from "../data.js";
import { formatPaymentDate, parsePaymentDate } from "../services/date.js";
import { currentBusinessDate, hrLevelOptions } from "../shared/lib/appDomain.jsx";
import { addDays, creditTermOptions } from "../shared/lib/credit.js";
import { nextContractNumber } from "../shared/lib/appHelpers.jsx";

const createConfig = {
  dashboard: {
    title: "Yeni sifariş",
    subtitle: "Sifariş satış, anbar və təhvil moduluna düşəcək.",
    fields: [
      { name: "customer", label: "Müştəri", required: true },
      { name: "fin", label: "FİN" },
      { name: "products", label: "Məhsul", required: true, full: true },
      { name: "amount", label: "Məbləğ", type: "number", required: true },
      { name: "paid", label: "Daxil olan", type: "number", value: "0" },
      {
        name: "status",
        label: "Status",
        type: "select",
        options: stages,
      },
    ],
  },
  crm: {
    title: "Yeni müştəri",
    subtitle: "FİN kodu və kredit limiti ilə müştəri açılışı.",
    fields: [
      { name: "name", label: "Ad Soyad", required: true },
      { name: "fin", label: "FİN", required: true },
      { name: "phone", label: "Telefon", required: true },
      {
        name: "category",
        label: "Kateqoriya",
        type: "select",
        options: ["Gümüş", "Qızıl", "Platin"],
      },
      { name: "limit", label: "Kredit limiti", type: "number" },
      { name: "debt", label: "Cari borc", type: "number", value: "0" },
    ],
  },
  sales: {
    title: "Yeni sifariş",
    subtitle: "Satıcı bölgüsü və ödəniş məlumatı ilə sifariş yaradın.",
    fields: [
      { name: "customer", label: "Müştəri", required: true },
      { name: "fin", label: "FİN" },
      { name: "products", label: "Məhsul", required: true, full: true },
      { name: "seller", label: "Satıcı bölgüsü" },
      { name: "amount", label: "Məbləğ", type: "number", required: true },
      { name: "paid", label: "Daxil olan", type: "number", value: "0" },
    ],
  },
  finance: {
    title: "Yeni xərc",
    subtitle: "Xərc avtomatik təsdiq gözləyir statusu ilə açılır.",
    fields: [
      { name: "description", label: "Təsvir", required: true },
      { name: "category", label: "Kateqoriya", required: true },
      { name: "date", label: "Tarix", type: "date", value: currentBusinessDate },
      { name: "amount", label: "Məbləğ", type: "number", required: true },
    ],
  },
  credits: {
    title: "Yeni kredit",
    subtitle: "Aylıq ödəniş cədvəli avtomatik hesablanır.",
    fields: [
      { name: "customer", label: "Müştəri", required: true },
      { name: "contractId", label: "Müqavilə №", value: nextContractNumber(initialState) },
      { name: "product", label: "Cihaz", required: true },
      { name: "total", label: "Ümumi məbləğ", type: "number", required: true },
      { name: "initialPayment", label: "İlkin ödəniş", type: "number", value: "0" },
      {
        name: "months",
        label: "Müddət",
        type: "select",
        value: "12",
        options: creditTermOptions.map((month) => `${month}`),
      },
      { name: "next", label: "Növbəti tarix", value: formatPaymentDate(addDays(parsePaymentDate(currentBusinessDate), 30)) },
    ],
  },
  vendors: {
    title: "Yeni vendor",
    subtitle: "Vendor kvota cədvəlinə əlavə olunacaq.",
    fields: [
      { name: "name", label: "Vendor adı", required: true },
      { name: "country", label: "Ölkə", required: true },
      { name: "sku", label: "SKU sayı", type: "number", required: true },
      { name: "quota", label: "Kvota", type: "number", required: true },
    ],
  },
  hr: {
    title: "Yeni əməkdaş",
    subtitle: "HR reyestrinə əməkdaş əlavə edin.",
    fields: [
      { name: "name", label: "Ad Soyad", required: true },
      { name: "position", label: "Vəzifə", required: true },
      { name: "department", label: "Şöbə", required: true },
      { name: "departmentParent", label: "Üst şöbə" },
      { name: "managerName", label: "Rəhbər adı" },
      {
        name: "level",
        label: "Səviyyə",
        type: "select",
        value: "Komanda üzvü",
        options: hrLevelOptions,
      },
      { name: "salary", label: "Maaş", type: "number", required: true },
      { name: "kpi", label: "KPI", type: "number", value: "85" },
      { name: "hireDate", label: "İşə qəbul tarixi", type: "date", value: currentBusinessDate },
      {
        name: "workMode",
        label: "İş rejimi",
        type: "select",
        value: "Ofis",
        options: ["Ofis", "Hybrid", "Sahə", "Uzaqdan"],
      },
      { name: "shift", label: "Növbə", value: "09:00-18:00" },
      {
        name: "employmentType",
        label: "Məşğulluq tipi",
        type: "select",
        value: "Tam ştat",
        options: ["Tam ştat", "Yarım ştat", "Müqaviləli", "Sınaq müddəti"],
      },
      { name: "leaveBalance", label: "Məzuniyyət balansı", type: "number", value: "0" },
      { name: "documentsComplete", label: "Sənədlər, %", type: "number", value: "100" },
      { name: "skills", label: "Bacarıqlar (vergüllə)", full: true },
    ],
  },
  contracts: {
    title: "Yeni müqavilə",
    subtitle: "Şablon əsasında müqavilə hazırlanacaq.",
    fields: [
      { name: "customer", label: "Müştəri", required: true },
      { name: "fin", label: "FİN" },
      { name: "product", label: "Məhsul", required: true },
      { name: "amount", label: "Məbləğ", type: "number", required: true },
    ],
  },
};

export { createConfig };
