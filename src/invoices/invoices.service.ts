import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateInvoiceDto,
  UpdateInvoiceStatusDto,
  AddInvoiceItemDto,
  ListInvoicesQueryDto,
  UpdateInvoiceDto,
} from './dto/invoice.dto';
import { generateExcel, generatePDF } from '../common/utils/export-helpers';
import {
  buildUploadUrl,
  resolveUploadPath,
  safeDeleteFile,
} from '../common/utils/upload.util';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { ActivityLogContext } from '../activity-logs/activity-logs.types';

@Injectable()
export class InvoicesService {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private activityLogsService: ActivityLogsService,
  ) {}

  private getBackendBaseUrl() {
    return this.configService.get<string>('APP_URL') || 'http://localhost:3000';
  }

  private formatRupiah(value: number) {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  }

  private generateInvoiceNumber(): string {
    const timestamp = Date.now();
    return `INV-${timestamp}`;
  }

  private async ensureCustomerExists(customerId: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      throw new BadRequestException(
        `Customer with ID ${customerId} not found`,
      );
    }
  }

  private normalizeItems(
    items: Array<{ description: string; quantity: number; unitPrice: number }>,
  ) {
    if (!Array.isArray(items) || items.length === 0) {
      throw new BadRequestException('Invoice wajib memiliki minimal 1 item.');
    }

    let subtotal = 0;
    const itemsData = items.map((item) => {
      const description = String(item.description || '').trim();
      const quantity = Number(item.quantity || 0);
      const unitPrice = Number(item.unitPrice || 0);

      if (!description) {
        throw new BadRequestException('Deskripsi item wajib diisi.');
      }

      if (quantity <= 0) {
        throw new BadRequestException('Quantity item harus lebih dari 0.');
      }

      if (unitPrice < 0) {
        throw new BadRequestException('Unit price item tidak valid.');
      }

      const amount = quantity * unitPrice;
      subtotal += amount;

      return {
        description,
        quantity,
        unitPrice,
        amount,
      };
    });

    return {
      itemsData,
      subtotal,
    };
  }

  private buildAttachmentPayload(file?: Express.Multer.File | null) {
    if (!file) {
      return {};
    }

    return {
      attachmentUrl: buildUploadUrl(
        this.getBackendBaseUrl(),
        'invoices',
        file.filename,
      ),
      attachmentName: file.originalname,
      attachmentMimeType: file.mimetype,
    };
  }

  private async logInvoiceActivity(input: {
    action: string;
    message: string;
    entityId: string;
    metadata?: Record<string, unknown>;
    context?: ActivityLogContext | null;
  }) {
    await this.activityLogsService.log({
      action: input.action,
      module: 'INVOICES',
      status: 'SUCCESS',
      message: input.message,
      entityType: 'INVOICE',
      entityId: input.entityId,
      metadata: input.metadata || null,
      context: input.context,
    });
  }

  async create(
    data: CreateInvoiceDto,
    attachment?: Express.Multer.File,
    context?: ActivityLogContext | null,
  ) {
    await this.ensureCustomerExists(data.customerId);

    const { itemsData, subtotal } = this.normalizeItems(data.items);
    const discountAmount = Number(data.discount || 0);
    const finalTotal = subtotal - discountAmount;

    if (finalTotal < 0) {
      throw new BadRequestException('Total invoice tidak valid.');
    }

    const invoice = await this.prisma.invoice.create({
      data: {
        invoiceNumber: this.generateInvoiceNumber(),
        customerId: data.customerId,
        issueDate: data.issueDate ? new Date(data.issueDate) : new Date(),
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        totalAmount: finalTotal,
        discount: discountAmount,
        notes: data.notes?.trim() || null,
        ...this.buildAttachmentPayload(attachment),
        items: {
          create: itemsData,
        },
      },
      include: {
        customer: true,
        items: true,
      },
    });

    await this.logInvoiceActivity({
      action: 'CREATE',
      message: 'Invoice berhasil dibuat.',
      entityId: invoice.id,
      metadata: {
        newValue: invoice,
      },
      context,
    });
    return invoice;
  }

  async update(
    id: string,
    data: UpdateInvoiceDto,
    attachment?: Express.Multer.File,
    context?: ActivityLogContext | null,
  ) {
    const existingInvoice = await this.prisma.invoice.findUnique({
      where: { id },
    });

    if (!existingInvoice) {
      throw new NotFoundException(`Invoice with ID ${id} not found`);
    }

    await this.ensureCustomerExists(data.customerId);

    const { itemsData, subtotal } = this.normalizeItems(data.items);
    const discountAmount = Number(data.discount || 0);
    const finalTotal = subtotal - discountAmount;

    if (finalTotal < 0) {
      throw new BadRequestException('Total invoice tidak valid.');
    }

    const shouldDeleteOldAttachment =
      Boolean(attachment) || Boolean(data.removeAttachment);

    if (
      shouldDeleteOldAttachment &&
      existingInvoice.attachmentUrl?.includes('/uploads/invoices/')
    ) {
      safeDeleteFile(resolveUploadPath(existingInvoice.attachmentUrl));
    }

    const updated = await this.prisma.invoice.update({
      where: { id },
      data: {
        customerId: data.customerId,
        issueDate: data.issueDate ? new Date(data.issueDate) : new Date(),
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        totalAmount: finalTotal,
        discount: discountAmount,
        notes: data.notes?.trim() || null,
        ...(attachment
          ? this.buildAttachmentPayload(attachment)
          : data.removeAttachment
            ? {
                attachmentUrl: null,
                attachmentName: null,
                attachmentMimeType: null,
              }
            : {}),
        items: {
          deleteMany: {},
          create: itemsData,
        },
      },
      include: {
        customer: true,
        items: true,
      },
    });
    await this.logInvoiceActivity({
      action: 'UPDATE',
      message: 'Invoice berhasil diperbarui.',
      entityId: updated.id,
      metadata: {
        oldValue: existingInvoice,
        newValue: updated,
      },
      context,
    });
    return updated;
  }

  async findAll(query: ListInvoicesQueryDto) {
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 10);
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.search) {
      where.OR = [
        { invoiceNumber: { contains: query.search, mode: 'insensitive' } },
        {
          customer: {
            name: { contains: query.search, mode: 'insensitive' },
          },
        },
      ];
    }

    const sortBy =
      query.sortBy &&
      [
        'invoiceNumber',
        'status',
        'totalAmount',
        'createdAt',
        'updatedAt',
      ].includes(query.sortBy)
        ? query.sortBy
        : 'createdAt';

    const sortOrder = query.sortOrder === 'asc' ? 'asc' : 'desc';

    const [items, total] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({
        where,
        include: {
          customer: true,
          items: true,
        },
        skip,
        take: limit,
        orderBy: {
          [sortBy]: sortOrder,
        },
      }),
      this.prisma.invoice.count({ where }),
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
    query: ListInvoicesQueryDto,
  ) {
    const listData = await this.findAll({ ...query, page: 1, limit: 10000 });
    const rows = listData.items;

    const headers = [
      'ID',
      'Invoice Number',
      'Customer Name',
      'Status',
      'Total Amount',
      'Created At',
    ];

    if (format === 'pdf') {
      const pdfRows = rows.map((row) => [
        row.id,
        row.invoiceNumber,
        row.customer?.name ?? '-',
        row.status,
        this.formatRupiah(row.totalAmount),
        row.createdAt.toLocaleDateString(),
      ]);
      const pdfBuffer = await generatePDF('Invoices List', headers, pdfRows);
      return {
        fileName: 'invoices.pdf',
        mimeType: 'application/pdf',
        contentBase64: pdfBuffer.toString('base64'),
      };
    }

    if (format === 'excel') {
      const excelRows = rows.map((row) => [
        row.id,
        row.invoiceNumber,
        row.customer?.name ?? '',
        row.status,
        row.totalAmount,
        row.createdAt,
      ]);
      const excelBuffer = await generateExcel('Invoices', headers, excelRows);
      return {
        fileName: 'invoices.xlsx',
        mimeType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        contentBase64: excelBuffer.toString('base64'),
      };
    }

    const csvHeader = [
      'id',
      'invoiceNumber',
      'customerName',
      'status',
      'totalAmount',
      'createdAt',
    ];
    const csvRows = [
      csvHeader.join(','),
      ...rows.map((row) =>
        [
          row.id,
          row.invoiceNumber,
          row.customer?.name ?? '',
          row.status,
          row.totalAmount,
          row.createdAt.toISOString(),
        ]
          .map((value) => `"${String(value).replace(/"/g, '""')}"`)
          .join(','),
      ),
    ];

    const csvContent = csvRows.join('\n');

    return {
      fileName: 'invoices.csv',
      mimeType: 'text/csv',
      contentBase64: Buffer.from(csvContent, 'utf-8').toString('base64'),
    };
  }

  async findOne(id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        customer: true,
        items: true,
      },
    });

    if (!invoice) {
      throw new NotFoundException(`Invoice with ID ${id} not found`);
    }

    return invoice;
  }

  async updateStatus(
    id: string,
    data: UpdateInvoiceStatusDto,
    context?: ActivityLogContext | null,
  ) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
    });

    if (!invoice) {
      throw new NotFoundException(`Invoice with ID ${id} not found`);
    }

    const updated = await this.prisma.invoice.update({
      where: { id },
      data: {
        status: data.status,
      },
      include: {
        customer: true,
        items: true,
      },
    });
    await this.logInvoiceActivity({
      action: 'UPDATE_STATUS',
      message: 'Status invoice berhasil diperbarui.',
      entityId: updated.id,
      metadata: {
        oldValue: { status: invoice.status },
        newValue: { status: updated.status },
      },
      context,
    });
    return updated;
  }

  async addItem(
    invoiceId: string,
    data: AddInvoiceItemDto,
    context?: ActivityLogContext | null,
  ) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
    });

    if (!invoice) {
      throw new NotFoundException(`Invoice with ID ${invoiceId} not found`);
    }

    const amount = data.quantity * data.unitPrice;

    const item = await this.prisma.invoiceItem.create({
      data: {
        invoiceId,
        description: data.description,
        quantity: data.quantity,
        unitPrice: data.unitPrice,
        amount,
      },
    });

    const totalAmount = invoice.totalAmount + amount;
    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        totalAmount,
      },
    });

    await this.logInvoiceActivity({
      action: 'ADD_ITEM',
      message: 'Item invoice berhasil ditambahkan.',
      entityId: invoiceId,
      metadata: {
        item,
      },
      context,
    });
    return item;
  }

  async removeItem(
    invoiceId: string,
    itemId: string,
    context?: ActivityLogContext | null,
  ) {
    const item = await this.prisma.invoiceItem.findUnique({
      where: { id: itemId },
    });

    if (!item) {
      throw new NotFoundException(`Invoice item with ID ${itemId} not found`);
    }

    if (item.invoiceId !== invoiceId) {
      throw new BadRequestException('Item does not belong to this invoice');
    }

    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
    });

    if (!invoice) {
      throw new NotFoundException(`Invoice with ID ${invoiceId} not found`);
    }

    const newTotal = invoice.totalAmount - item.amount;
    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        totalAmount: newTotal,
      },
    });

    const deleted = await this.prisma.invoiceItem.delete({
      where: { id: itemId },
    });
    await this.logInvoiceActivity({
      action: 'REMOVE_ITEM',
      message: 'Item invoice berhasil dihapus.',
      entityId: invoiceId,
      metadata: {
        item: deleted,
      },
      context,
    });
    return deleted;
  }

  async getInvoicesByCustomer(customerId: string) {
    return this.prisma.invoice.findMany({
      where: { customerId },
      include: {
        items: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async getAttachment(id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
    });

    if (!invoice) {
      throw new NotFoundException(`Invoice with ID ${id} not found`);
    }

    if (
      !invoice.attachmentUrl ||
      !invoice.attachmentName ||
      !invoice.attachmentMimeType
    ) {
      throw new NotFoundException('File attachment tidak ditemukan.');
    }

    return {
      absolutePath: resolveUploadPath(invoice.attachmentUrl),
      fileName: invoice.attachmentName,
      mimeType: invoice.attachmentMimeType,
    };
  }

  async remove(id: string, context?: ActivityLogContext | null) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
    });

    if (!invoice) {
      throw new NotFoundException(`Invoice with ID ${id} not found`);
    }

    if (invoice.attachmentUrl?.includes('/uploads/invoices/')) {
      safeDeleteFile(resolveUploadPath(invoice.attachmentUrl));
    }

    const deleted = await this.prisma.invoice.delete({
      where: { id },
    });
    await this.logInvoiceActivity({
      action: 'DELETE',
      message: 'Invoice berhasil dihapus.',
      entityId: deleted.id,
      metadata: {
        oldValue: invoice,
      },
      context,
    });
    return deleted;
  }
}
