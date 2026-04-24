import { Controller, Get, Param } from "@nestjs/common";

import { Public } from "../../../../common/auth/public.decorator";
import { GetCategoryUseCase } from "../../application/use-cases/get-category.use-case";
import { ListCategoriesUseCase } from "../../application/use-cases/list-categories.use-case";
import { ListVehicleTypesUseCase } from "../../application/use-cases/list-vehicle-types.use-case";

import type {
  ServiceCategoryDetail,
  ServiceCategoryRecord,
  VehicleTypeRecord,
} from "../../application/ports/service-category.repository.port";

@Public()
@Controller("catalog")
export class CatalogController {
  constructor(
    private readonly listCategories: ListCategoriesUseCase,
    private readonly getCategory: GetCategoryUseCase,
    private readonly listVehicleTypes: ListVehicleTypesUseCase,
  ) {}

  @Get("categories")
  async list(): Promise<ServiceCategoryRecord[]> {
    return this.listCategories.execute();
  }

  @Get("categories/:slug")
  async detail(@Param("slug") slug: string): Promise<ServiceCategoryDetail> {
    return this.getCategory.execute(slug);
  }

  @Get("categories/:slug/vehicle-types")
  async vehicleTypes(@Param("slug") slug: string): Promise<VehicleTypeRecord[]> {
    return this.listVehicleTypes.execute(slug);
  }
}
