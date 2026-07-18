import { normalize } from "../../services/format.js";
import { total } from "../utils/aggregate.js";

export function buildProjectRoiSummary(projects = []) {
  const revenue = total(projects, "revenue");
  const cost = total(projects, "totalCost");
  const committedCost = total(projects, "committedCost");
  const profit = total(projects, "profit");
  const projectedProfit = total(projects, "projectedProfit");
  const avgRoi = projects.length
    ? projects.reduce((sum, project) => sum + Number(project.roi || 0), 0) / projects.length
    : 0;
  const riskCount = projects.filter(
    (project) =>
      normalize(project.status).includes("risk") || normalize(project.status).includes("aşım"),
  ).length;

  return {
    revenue,
    cost,
    committedCost,
    profit,
    projectedProfit,
    avgRoi,
    riskCount,
    rows: projects.length,
    exportedCount: projects.filter((project) => project.lastExportAt).length,
  };
}
