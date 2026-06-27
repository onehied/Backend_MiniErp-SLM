import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  AssignRoleDto,
  CreateUserDto,
  ListUsersQueryDto,
  UpdateUserDto,
} from './dto/users.dto';
import * as bcrypt from 'bcrypt';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { ActivityLogContext } from '../activity-logs/activity-logs.types';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private activityLogsService: ActivityLogsService,
  ) {}

  private readonly includeRoles = {
    userRoles: {
      include: {
        role: true,
      },
    },
  };

  private mapUser(user: any) {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      name: user.name,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      roles:
        user.userRoles?.map((entry: any) => ({
          id: entry.role.id,
          roleName: entry.role.roleName,
          description: entry.role.description,
        })) ?? [],
    };
  }

  private async logUserActivity(input: {
    action: string;
    message: string;
    entityId: string;
    metadata?: Record<string, unknown>;
    context?: ActivityLogContext | null;
  }) {
    await this.activityLogsService.log({
      action: input.action,
      module: 'USERS',
      status: 'SUCCESS',
      message: input.message,
      entityType: 'USER',
      entityId: input.entityId,
      metadata: input.metadata || null,
      context: input.context,
    });
  }

  async findAll(query: ListUsersQueryDto) {
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 10);
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.search) {
      where.OR = [
        { username: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
        { name: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.status) {
      where.status = query.status;
    }

    const sortBy =
      query.sortBy &&
      [
        'username',
        'email',
        'name',
        'status',
        'createdAt',
        'updatedAt',
      ].includes(query.sortBy)
        ? query.sortBy
        : 'createdAt';

    const sortOrder = query.sortOrder === 'asc' ? 'asc' : 'desc';

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          [sortBy]: sortOrder,
        },
        include: this.includeRoles,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items: items.map((item) => this.mapUser(item)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: this.includeRoles,
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return this.mapUser(user);
  }

  async create(data: CreateUserDto, context?: ActivityLogContext | null) {
    const existsEmail = await this.prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existsEmail) {
      throw new BadRequestException('Email already registered');
    }

    const existsUsername = await this.prisma.user.findUnique({
      where: { username: data.username },
    });

    if (existsUsername) {
      throw new BadRequestException('Username already exists');
    }

    const roleIds = data.roleIds ?? [];

    if (roleIds.length > 0) {
      const rolesCount = await this.prisma.role.count({
        where: { id: { in: roleIds } },
      });

      if (rolesCount !== roleIds.length) {
        throw new BadRequestException('One or more roles are invalid');
      }
    }

    const hashed = await bcrypt.hash(data.password, 10);

    const user = await this.prisma.user.create({
      data: {
        username: data.username,
        email: data.email,
        name: data.name,
        passwordHash: hashed,
        status: data.status ?? 'ACTIVE',
        userRoles:
          roleIds.length > 0
            ? {
                create: roleIds.map((roleId) => ({ roleId })),
              }
            : undefined,
      },
      include: this.includeRoles,
    });

    const mapped = this.mapUser(user);
    await this.logUserActivity({
      action: 'CREATE',
      message: 'User berhasil dibuat.',
      entityId: mapped.id,
      metadata: {
        newValue: mapped,
      },
      context,
    });
    return mapped;
  }

  async update(id: string, data: UpdateUserDto, context?: ActivityLogContext | null) {
    const existing = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    if (data.email && data.email !== existing.email) {
      const emailUsed = await this.prisma.user.findUnique({
        where: { email: data.email },
      });
      if (emailUsed) {
        throw new BadRequestException('Email already registered');
      }
    }

    if (data.username && data.username !== existing.username) {
      const usernameUsed = await this.prisma.user.findUnique({
        where: { username: data.username },
      });
      if (usernameUsed) {
        throw new BadRequestException('Username already exists');
      }
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        username: data.username,
        email: data.email,
        name: data.name,
        status: data.status,
        passwordHash: data.password
          ? await bcrypt.hash(data.password, 10)
          : undefined,
      },
      include: this.includeRoles,
    });

    const mapped = this.mapUser(updated);
    await this.logUserActivity({
      action: 'UPDATE',
      message: 'User berhasil diperbarui.',
      entityId: mapped.id,
      metadata: {
        oldValue: {
          id: existing.id,
          username: existing.username,
          email: existing.email,
          name: existing.name,
          status: existing.status,
        },
        newValue: mapped,
      },
      context,
    });
    return mapped;
  }

  async remove(id: string, context?: ActivityLogContext | null) {
    const existing = await this.prisma.user.findUnique({ where: { id } });

    if (!existing) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    await this.prisma.user.delete({ where: { id } });
    await this.logUserActivity({
      action: 'DELETE',
      message: 'User berhasil dihapus.',
      entityId: existing.id,
      metadata: {
        oldValue: {
          id: existing.id,
          username: existing.username,
          email: existing.email,
          name: existing.name,
          status: existing.status,
        },
      },
      context,
    });

    return {
      message: 'User deleted successfully',
    };
  }

  async assignRole(
    userId: string,
    data: AssignRoleDto,
    context?: ActivityLogContext | null,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    const role = await this.prisma.role.findUnique({
      where: { id: data.roleId },
    });
    if (!role) {
      throw new NotFoundException(`Role with ID ${data.roleId} not found`);
    }

    await this.prisma.userRole.upsert({
      where: {
        userId_roleId: {
          userId,
          roleId: data.roleId,
        },
      },
      update: {},
      create: {
        userId,
        roleId: data.roleId,
      },
    });

    const updated = await this.findOne(userId);
    await this.logUserActivity({
      action: 'ASSIGN_ROLE',
      message: 'Role berhasil ditambahkan ke user.',
      entityId: userId,
      metadata: {
        roleId: data.roleId,
        newValue: updated,
      },
      context,
    });
    return updated;
  }

  async removeRole(
    userId: string,
    roleId: string,
    context?: ActivityLogContext | null,
  ) {
    const userRole = await this.prisma.userRole.findFirst({
      where: { userId, roleId },
    });

    if (!userRole) {
      throw new NotFoundException('User role assignment not found');
    }

    await this.prisma.userRole.delete({
      where: { id: userRole.id },
    });

    const updated = await this.findOne(userId);
    await this.logUserActivity({
      action: 'REMOVE_ROLE',
      message: 'Role berhasil dilepas dari user.',
      entityId: userId,
      metadata: {
        roleId,
        newValue: updated,
      },
      context,
    });
    return updated;
  }
}
