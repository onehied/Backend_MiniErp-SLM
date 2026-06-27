import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCustomerDto,
  UpdateCustomerDto,
  ListCustomersQueryDto,
} from './dto/customer.dto';
import { generateExcel, generatePDF } from '../common/utils/export-helpers';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { ActivityLogContext } from '../activity-logs/activity-logs.types';

@Injectable()
export class CustomersService {
  constructor(
    private prisma: PrismaService,
    private activityLogsService: ActivityLogsService,
  ) {}

  private async logCustomerActivity(input: {
    action: 'CREATE' | 'UPDATE' | 'DELETE';
    message: string;
    entityId: string;
    metadata?: Record<string, unknown>;
    context?: ActivityLogContext | null;
  }) {
    await this.activityLogsService.log({
      action: input.action,
      module: 'CUSTOMERS',
      status: 'SUCCESS',
      message: input.message,
      entityType: 'CUSTOMER',
      entityId: input.entityId,
      metadata: input.metadata || null,
      context: input.context,
    });
  }

  async create(data: CreateCustomerDto, context?: ActivityLogContext | null) {
    // Cek apakah email sudah ada (jika email diberikan)
    if (data.email) {
      const existingCustomer = await this.prisma.customer.findUnique({
        where: { email: data.email },
      });
      if (existingCustomer) {
        throw new ConflictException('Email already exists');
      }
    }

    const created = await this.prisma.customer.create({
      data,
    });
    await this.logCustomerActivity({
      action: 'CREATE',
      message: 'Customer berhasil dibuat.',
      entityId: created.id,
      metadata: {
        newValue: created,
      },
      context,
    });
    return created;
  }

  async findAll(query: ListCustomersQueryDto) {
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 10);
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search, mode: 'insensitive' } },
        { city: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const sortBy =
      query.sortBy &&
      ['name', 'email', 'city', 'createdAt', 'updatedAt'].includes(query.sortBy)
        ? query.sortBy
        : 'createdAt';

    const sortOrder = query.sortOrder === 'asc' ? 'asc' : 'desc';

    const [items, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          [sortBy]: sortOrder,
        },
      }),
      this.prisma.customer.count({ where }),
    ]);

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async exportData(
    format: 'csv' | 'excel' | 'pdf',
    query: ListCustomersQueryDto,
  ) {
    const listData = await this.findAll({ ...query, page: 1, limit: 10000 });
    const rows = listData.items;

    const headers = ['ID', 'Name', 'Email', 'Phone', 'City', 'Created At'];

    if (format === 'pdf') {
      const pdfRows = rows.map((row) => [
        row.id,
        row.name,
        row.email ?? '-',
        row.phone ?? '-',
        row.city ?? '-',
        row.createdAt.toLocaleDateString(),
      ]);
      const pdfBuffer = await generatePDF('Customers List', headers, pdfRows);
      return {
        fileName: 'customers.pdf',
        mimeType: 'application/pdf',
        contentBase64: pdfBuffer.toString('base64'),
      };
    }

    if (format === 'excel') {
      const excelRows = rows.map((row) => [
        row.id,
        row.name,
        row.email ?? '',
        row.phone ?? '',
        row.city ?? '',
        row.createdAt,
      ]);
      const excelBuffer = await generateExcel('Customers', headers, excelRows);
      return {
        fileName: 'customers.xlsx',
        mimeType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        contentBase64: excelBuffer.toString('base64'),
      };
    }

    const csvHeader = ['id', 'name', 'email', 'phone', 'city', 'createdAt'];
    const csvRows = [
      csvHeader.join(','),
      ...rows.map((row) =>
        [
          row.id,
          row.name,
          row.email ?? '',
          row.phone ?? '',
          row.city ?? '',
          row.createdAt.toISOString(),
        ]
          .map((value) => `"${String(value).replace(/"/g, '""')}"`)
          .join(','),
      ),
    ];

    const csvContent = csvRows.join('\n');

    return {
      fileName: 'customers.csv',
      mimeType: 'text/csv',
      contentBase64: Buffer.from(csvContent, 'utf-8').toString('base64'),
    };
  }

  async findOne(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        invoices: true,
      },
    });

    if (!customer) {
      throw new NotFoundException(`Customer with ID ${id} not found`);
    }

    return customer;
  }

  async update(id: string, data: UpdateCustomerDto, context?: ActivityLogContext | null) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
    });

    if (!customer) {
      throw new NotFoundException(`Customer with ID ${id} not found`);
    }

    // Cek apakah email sudah ada di customer lain (jika email diberikan)
    if (data.email) {
      const existingCustomer = await this.prisma.customer.findUnique({
        where: { email: data.email },
      });
      if (existingCustomer && existingCustomer.id !== id) {
        throw new ConflictException('Email already exists');
      }
    }

    const updated = await this.prisma.customer.update({
      where: { id },
      data,
    });
    await this.logCustomerActivity({
      action: 'UPDATE',
      message: 'Customer berhasil diperbarui.',
      entityId: updated.id,
      metadata: {
        oldValue: customer,
        newValue: updated,
      },
      context,
    });
    return updated;
  }

  async remove(id: string, context?: ActivityLogContext | null) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
    });

    if (!customer) {
      throw new NotFoundException(`Customer with ID ${id} not found`);
    }

    const deleted = await this.prisma.customer.delete({
      where: { id },
    });
    await this.logCustomerActivity({
      action: 'DELETE',
      message: 'Customer berhasil dihapus.',
      entityId: deleted.id,
      metadata: {
        oldValue: customer,
      },
      context,
    });
    return deleted;
  }
}
