import { BadRequestException, Body, Controller, Delete, Get, Module, NotFoundException, Param, Patch, Post, Put } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { z } from 'zod';
import { AuthUser, CurrentUser, Public } from '../common/auth';
import { Zod, zEgPhone, zId } from '../common/util';

const AddressDto = z.object({
  label: z.string().max(40).optional(),
  fullName: z.string().min(2).max(80),
  phone: zEgPhone,
  governorate: zId,
  city: z.string().min(1).max(80),
  area: z.string().max(80).default(''),
  street: z.string().min(1).max(160),
  building: z.string().max(80).default(''),
  notes: z.string().max(300).default(''),
  isDefault: z.boolean().default(false),
});
const ProfileDto = z.object({ name: z.string().min(2).max(80).optional(), phone: zEgPhone.optional(), locale: z.enum(['en', 'ar']).optional() });
const CartDto = z.object({ items: z.array(z.object({ product: zId, variant: zId, qty: z.number().int().min(1).max(20) })).max(100) });

@Controller('account')
export class AccountController {
  constructor(
    @InjectModel('User') private readonly users: Model<any>,
    @InjectModel('Governorate') private readonly govs: Model<any>,
  ) {}

  @Patch('profile')
  async profile(@CurrentUser() u: AuthUser, @Body(new Zod(ProfileDto)) b: z.infer<typeof ProfileDto>) {
    if (b.phone && (await this.users.exists({ phone: b.phone, _id: { $ne: u.id } }))) throw new BadRequestException('Phone already used');
    await this.users.updateOne({ _id: u.id }, b);
    return { ok: true };
  }

  /* addresses */
  @Get('addresses')
  async addresses(@CurrentUser() u: AuthUser) {
    const user = await this.users.findById(u.id).select('addresses').populate('addresses.governorate', 'name').lean<any>();
    return user?.addresses ?? [];
  }

  @Post('addresses')
  async addAddress(@CurrentUser() u: AuthUser, @Body(new Zod(AddressDto)) b: z.infer<typeof AddressDto>) {
    if (!(await this.govs.exists({ _id: b.governorate, active: true }))) throw new BadRequestException('We do not deliver to this governorate yet');
    const user = await this.users.findById(u.id);
    if (user.addresses.length >= 10) throw new BadRequestException('Maximum 10 addresses');
    if (b.isDefault || !user.addresses.length) user.addresses.forEach((a: any) => (a.isDefault = false));
    user.addresses.push({ ...b, isDefault: b.isDefault || !user.addresses.length });
    await user.save();
    return user.addresses[user.addresses.length - 1];
  }

  @Put('addresses/:id')
  async updateAddress(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new Zod(AddressDto)) b: z.infer<typeof AddressDto>) {
    const user = await this.users.findById(u.id);
    const a = user.addresses.id(id);
    if (!a) throw new NotFoundException();
    if (b.isDefault) user.addresses.forEach((x: any) => (x.isDefault = false));
    Object.assign(a, b);
    await user.save();
    return a;
  }

  @Delete('addresses/:id')
  async deleteAddress(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    const user = await this.users.findById(u.id);
    const wasDefault = user.addresses.id(id)?.isDefault;
    user.addresses.pull(id);
    if (wasDefault && user.addresses[0]) user.addresses[0].isDefault = true;
    await user.save();
    return { ok: true };
  }

  /* wishlist */
  @Get('wishlist')
  async wishlist(@CurrentUser() u: AuthUser) {
    const user = await this.users
      .findById(u.id)
      .select('wishlist')
      .populate({ path: 'wishlist', match: { status: 'LIVE' }, populate: { path: 'seller', select: 'storeName slug' } })
      .lean<any>();
    return (user?.wishlist ?? []).filter(Boolean);
  }

  @Get('wishlist/ids')
  async wishlistIds(@CurrentUser() u: AuthUser) {
    const user = await this.users.findById(u.id).select('wishlist').lean<any>();
    return (user?.wishlist ?? []).map(String);
  }

  @Post('wishlist/:productId')
  async addWish(@CurrentUser() u: AuthUser, @Param('productId') pid: string) {
    await this.users.updateOne({ _id: u.id }, { $addToSet: { wishlist: pid } });
    return { ok: true };
  }

  @Delete('wishlist/:productId')
  async removeWish(@CurrentUser() u: AuthUser, @Param('productId') pid: string) {
    await this.users.updateOne({ _id: u.id }, { $pull: { wishlist: pid } });
    return { ok: true };
  }

  /* saved cart (logged-in users) */
  @Get('cart')
  async cart(@CurrentUser() u: AuthUser) {
    const user = await this.users.findById(u.id).select('cart').lean<any>();
    return (user?.cart ?? []).map((c: any) => ({ product: String(c.product), variant: String(c.variant), qty: c.qty }));
  }

  @Put('cart')
  async saveCart(@CurrentUser() u: AuthUser, @Body(new Zod(CartDto)) b: z.infer<typeof CartDto>) {
    await this.users.updateOne({ _id: u.id }, { cart: b.items });
    return { ok: true };
  }
}

@Controller('geo')
export class GeoController {
  constructor(@InjectModel('Governorate') private readonly govs: Model<any>) {}

  @Public()
  @Get('governorates')
  list() {
    return this.govs.find({ active: true }).sort({ sort: 1 }).lean();
  }
}

@Module({ controllers: [AccountController, GeoController] })
export class AccountModule {}
