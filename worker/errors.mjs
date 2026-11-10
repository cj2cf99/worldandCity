// 统一错误（设计 §6.3）。服务层抛出，Worker 路由层映射为 {"error": {code, message, details}}。
export const ERROR_CODES = [
  'E_AUTH', 'E_FORBIDDEN_ORIGIN', 'E_VALIDATION', 'E_NOT_FOUND', 'E_CONFLICT', 'E_HISTORY_OBJECT_LIMIT',
  'E_PIN_LIMIT', 'E_RELATION_INVALID', 'E_GEOMETRY_INVALID', 'E_NODE_IN_USE', 'E_UPLOAD_INVALID',
  'E_UPSTREAM_UNAVAILABLE', 'E_FORBIDDEN_OP',
];

export class AppError extends Error {
  constructor(code, message, details) {
    if (!ERROR_CODES.includes(code)) throw new Error(`未登记的错误码：${code}`);
    super(message);
    this.code = code;
    this.details = details;
  }
}
