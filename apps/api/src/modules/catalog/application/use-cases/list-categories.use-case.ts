import { Inject, Injectable } from "@nestjs/common";

import {
  SERVICE_CATEGORY_REPOSITORY_PORT,
  type ServiceCategoryRecord,
  type ServiceCategoryRepositoryPort,
} from "../ports/service-category.repository.port";

@Injectable()
export class ListCategoriesUseCase {
  constructor(
    @Inject(SERVICE_CATEGORY_REPOSITORY_PORT)
    private readonly repo: ServiceCategoryRepositoryPort,
  ) {}

  async execute(): Promise<ServiceCategoryRecord[]> {
    return this.repo.listActive();
  }
}
