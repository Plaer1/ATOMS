import * as defaults from "../configDefaults.js";
import * as overrides from "../../config.js";

export const zoomInKey = overrides.zoomInKey ?? defaults.zoomInKey;
export const zoomOutKey = overrides.zoomOutKey ?? defaults.zoomOutKey;
export const year = overrides.year ?? defaults.year;
export const month = overrides.month ?? defaults.month;
export const day = overrides.day ?? defaults.day;
export const staticKeywords = overrides.staticKeywords ?? defaults.staticKeywords;
export const staticAppNames = overrides.staticAppNames ?? defaults.staticAppNames;
