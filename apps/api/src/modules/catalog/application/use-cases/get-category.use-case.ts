import { Inject, Injectable } from "@nestjs/common";

import { CategoryNotFoundError } from "../../domain/errors/category-not-found.error";
import { SlugVO } from "../../domain/value-objects/slug.vo";
import {
  SERVICE_CATEGORY_REPOSITORY_PORT,
  type ServiceCategoryDetail,
  type ServiceCategoryRepositoryPort,
} from "../ports/service-category.repository.port";

@Injectable()
export class GetCategoryUseCase {
  constructor(
    @Inject(SERVICE_CATEGORY_REPOSITORY_PORT)
    private readonly repo: ServiceCategoryRepositoryPort,
  ) {}

  async execute(rawSlug: string): Promise<ServiceCategoryDetail> {
    const slug = SlugVO.create(rawSlug);
    const found = await this.repo.findActiveBySlug(slug.value);
    if (!found) {
      throw new CategoryNotFoundError(`No active category for slug: ${slug.value}`);
    }
    return found;
  }
}
