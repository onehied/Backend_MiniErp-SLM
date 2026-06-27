import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoleDto, UpdateRoleDto } from './dto/roles.dto';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { ActivityLogContext } from '../activity-logs/activity-logs.types';

@Injectable()
export class RolesService {
  constructor(
    private prisma: PrismaService,
    private activityLogsService: ActivityLogsService,
  ) {}

  private async logRoleActivity(input: {
    action: 'CREATE' | 'UPDATE' | 'DELETE';
    message: string;
    entityId: string;
    metadata?: Record<string, unknown>;
    context?: ActivityLogContext | null;
  }) {
    await this.activityLogsService.log({
      action: input.action,
      module: 'ROLES',
      status: 'SUCCESS',
      message: input.message,
      entityType: 'ROLE',
      entityId: input.entityId,
      metadata: input.metadata || null,
      context: input.context,
    });
  }

  async findAll() {
    return this.prisma.role.findMany({
      orderBy: {
        roleName: 'asc',
      },
      include: {
        userRoles: {
          include: {
            user: true,
          },
        },
      },
    });
  }

  async findOne(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: {
        userRoles: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!role) {
      throw new NotFoundException(`Role with ID ${id} not found`);
    }

    return role;
  }

  async create(data: CreateRoleDto, context?: ActivityLogContext | null) {
    const existing = await this.prisma.role.findUnique({
      where: { roleName: data.roleName },
    });

    if (existing) {
      throw new BadRequestException('Role name already exists');
    }

    const created = await this.prisma.role.create({
      data,
    });
    await this.logRoleActivity({
      action: 'CREATE',
      message: 'Role berhasil dibuat.',
      entityId: created.id,
      metadata: { newValue: created },
      context,
    });
    return created;
  }

  async update(id: string, data: UpdateRoleDto, context?: ActivityLogContext | null) {
    const role = await this.prisma.role.findUnique({ where: { id } });

    if (!role) {
      throw new NotFoundException(`Role with ID ${id} not found`);
    }

    if (data.roleName && data.roleName !== role.roleName) {
      const existing = await this.prisma.role.findUnique({
        where: { roleName: data.roleName },
      });

      if (existing) {
        throw new BadRequestException('Role name already exists');
      }
    }

    const updated = await this.prisma.role.update({
      where: { id },
      data,
    });
    await this.logRoleActivity({
      action: 'UPDATE',
      message: 'Role berhasil diperbarui.',
      entityId: updated.id,
      metadata: {
        oldValue: role,
        newValue: updated,
      },
      context,
    });
    return updated;
  }

  async remove(id: string, context?: ActivityLogContext | null) {
    const role = await this.prisma.role.findUnique({ where: { id } });

    if (!role) {
      throw new NotFoundException(`Role with ID ${id} not found`);
    }

    await this.prisma.role.delete({ where: { id } });
    await this.logRoleActivity({
      action: 'DELETE',
      message: 'Role berhasil dihapus.',
      entityId: role.id,
      metadata: {
        oldValue: role,
      },
      context,
    });

    return {
      message: 'Role deleted successfully',
    };
  }
}
