export interface ActivityLogContext {
  actorUserId?: string | null;
  actorEmail?: string | null;
  actorName?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  method?: string | null;
  path?: string | null;
}

export interface CreateActivityLogInput {
  action: string;
  module: string;
  status: 'SUCCESS' | 'FAILED';
  message?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
  context?: ActivityLogContext | null;
}
