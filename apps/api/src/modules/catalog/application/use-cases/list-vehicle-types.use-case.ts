import { Inject, Injectable } from "@nestjs/common";

import { CategoryNotFoundError } from "../../domain/errors/category-not-found.error";
import { SlugVO } from "../../domain/value-objects/slug.vo";
import {
  SERVICE_CATEGORY_REPOSITORY_PORT,
  type ServiceCategoryRepositoryPort,
  type VehicleTypeRecord,
} from "../ports/service-category.repository.port";

@Injectable()
export class ListVehicleTypesUseCase {
  constructor(
    @Inject(SERVICE_CATEGORY_REPOSITORY_PORT)
    private readonly repo: ServiceCategoryRepositoryPort,
  ) {}

  async execute(rawSlug: string): Promise<VehicleTypeRecord[]> {
    const slug = SlugVO.create(rawSlug);
    const detail = await this.repo.findActiveBySlug(slug.value);
    if (!detail) {
      throw new CategoryNotFoundError(`No active category for slug: ${slug.value}`);
    }
    return detail.vehicleTypes;
  }
}
