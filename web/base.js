// 部署前缀与接口前缀：独立运行时为 "/" 与 "/api/v1"；挂进主站时由构建参数改为 "/worldandcity/" 与 "/api/worldandcity/v1"。
export const BASE = import.meta.env.BASE_URL; // 以 / 结尾
export const API = import.meta.env.VITE_API || '/api/v1';
export const HOSTED = !!import.meta.env.VITE_HOSTED;
