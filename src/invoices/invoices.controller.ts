import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  UseGuards,
  Query,
  UploadedFile,
  UseInterceptors,
  Res,
  Req,
} from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import {
  CreateInvoiceDto,
  UpdateInvoiceStatusDto,
  AddInvoiceItemDto,
  ListInvoicesQueryDto,
  UpdateInvoiceDto,
} from './dto/invoice.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import { createUploadStorage } from '../common/utils/upload.util';
import type { Response } from 'express';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';

@Controller('invoices')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'USER')
export class InvoicesController {
  constructor(
    private invoicesService: InvoicesService,
    private activityLogsService: ActivityLogsService,
  ) {}

  private normalizeInvoiceBody(body: any): UpdateInvoiceDto {
    let items = body?.items;

    if (typeof body?.items === 'string') {
      try {
        items = JSON.parse(body.items);
      } catch {
        throw new BadRequestException('Format items invoice tidak valid.');
      }
    }

    if (!Array.isArray(items)) {
      throw new BadRequestException('Items invoice tidak valid.');
    }

    return {
      customerId: String(body.customerId || ''),
      issueDate: body.issueDate || undefined,
      dueDate: body.dueDate || undefined,
      discount: body.discount !== undefined ? Number(body.discount) : 0,
      notes: body.notes || '',
      removeAttachment:
        body.removeAttachment === true || body.removeAttachment === 'true',
      items: items.map((item: any) => ({
        description: String(item.description || ''),
        quantity: Number(item.quantity || 0),
        unitPrice: Number(item.unitPrice || 0),
      })),
    };
  }

  @Post()
  @UseInterceptors(
    FileInterceptor('attachment', {
      storage: createUploadStorage('invoices'),
      limits: {
        fileSize: 5 * 1024 * 1024,
      },
      fileFilter: (_req, file, callback) => {
        if (
          ['application/pdf', 'image/jpeg'].includes(file.mimetype)
        ) {
          callback(null, true);
          return;
        }

        callback(new BadRequestException('File harus PDF, JPG, atau JPEG.') as any, false);
      },
    }),
  )
  async create(
    @Req() req: any,
    @Body() body: any,
    @UploadedFile() attachment?: Express.Multer.File,
  ) {
    return this.invoicesService.create(
      this.normalizeInvoiceBody(body) as CreateInvoiceDto,
      attachment,
      this.activityLogsService.getRequestContext(req),
    );
  }

  @Get()
  async findAll(@Query() query: ListInvoicesQueryDto) {
    return this.invoicesService.findAll(query);
  }

  @Get('export/data')
  async exportData(
    @Query() query: ListInvoicesQueryDto,
  ) {
    const format = query.format ?? 'csv';
    return this.invoicesService.exportData(format, query);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.invoicesService.findOne(id);
  }

  @Patch(':id')
  @UseInterceptors(
    FileInterceptor('attachment', {
      storage: createUploadStorage('invoices'),
      limits: {
        fileSize: 5 * 1024 * 1024,
      },
      fileFilter: (_req, file, callback) => {
        if (
          ['application/pdf', 'image/jpeg'].includes(file.mimetype)
        ) {
          callback(null, true);
          return;
        }

        callback(new BadRequestException('File harus PDF, JPG, atau JPEG.') as any, false);
      },
    }),
  )
  async update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: any,
    @UploadedFile() attachment?: Express.Multer.File,
  ) {
    return this.invoicesService.update(
      id,
      this.normalizeInvoiceBody(body),
      attachment,
      this.activityLogsService.getRequestContext(req),
    );
  }

  @Patch(':id/status')
  async updateStatus(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateInvoiceStatusDto,
  ) {
    return this.invoicesService.updateStatus(
      id,
      dto,
      this.activityLogsService.getRequestContext(req),
    );
  }

  @Post(':id/items')
  async addItem(
    @Req() req: any,
    @Param('id') invoiceId: string,
    @Body() dto: AddInvoiceItemDto,
  ) {
    return this.invoicesService.addItem(
      invoiceId,
      dto,
      this.activityLogsService.getRequestContext(req),
    );
  }

  @Delete(':invoiceId/items/:itemId')
  async removeItem(
    @Req() req: any,
    @Param('invoiceId') invoiceId: string,
    @Param('itemId') itemId: string,
  ) {
    return this.invoicesService.removeItem(
      invoiceId,
      itemId,
      this.activityLogsService.getRequestContext(req),
    );
  }

  @Get('by-customer/:customerId')
  async getByCustomer(@Param('customerId') customerId: string) {
    return this.invoicesService.getInvoicesByCustomer(customerId);
  }

  @Get(':id/attachment')
  async getAttachment(
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const attachment = await this.invoicesService.getAttachment(id);
    res.setHeader('Content-Type', attachment.mimeType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(attachment.fileName)}"`,
    );

    return res.sendFile(attachment.absolutePath);
  }

  @Delete(':id')
  async remove(@Req() req: any, @Param('id') id: string) {
    return this.invoicesService.remove(
      id,
      this.activityLogsService.getRequestContext(req),
    );
  }
}
