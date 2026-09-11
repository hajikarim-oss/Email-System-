import prisma from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";

export class AuditService {
  /**
   * Log an audit action
   */
  static async log(input: {
    userId: string;
    action: string;
    resourceType: string;
    resourceId?: string;
    metadata?: Prisma.InputJsonValue;
  }): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          userId: input.userId,
          action: input.action,
          resourceType: input.resourceType,
          resourceId: input.resourceId,
          metadata: input.metadata,
        },
      });
    } catch (error) {
      console.error("Failed to write audit log:", error);
    }
  }

  /**
   * Get audit logs with pagination and filters
   */
  static async getLogs(params: {
    userId?: string;
    action?: string;
    resourceType?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = params.page || 1;
    const pageSize = params.pageSize || 20;

    const where: Prisma.AuditLogWhereInput = {};
    if (params.userId) where.userId = params.userId;
    if (params.action) where.action = params.action;
    if (params.resourceType) where.resourceType = params.resourceType;

    const [total, logs] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      logs,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }
}
