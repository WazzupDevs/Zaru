import { Module } from "@nestjs/common";

import { SERVICE_CATEGORY_REPOSITORY_PORT } from "./application/ports/service-category.repository.port";
import { GetCategoryUseCase } from "./application/use-cases/get-category.use-case";
import { ListCategoriesUseCase } from "./application/use-cases/list-categories.use-case";
import { ListVehicleTypesUseCase } from "./application/use-cases/list-vehicle-types.use-case";
import { PrismaServiceCategoryRepository } from "./infrastructure/persistence/prisma-service-category.repository";
import { CatalogController } from "./interface/controllers/catalog.controller";

@Module({
  controllers: [CatalogController],
  providers: [
    ListCategoriesUseCase,
    GetCategoryUseCase,
    ListVehicleTypesUseCase,
    {
      provide: SERVICE_CATEGORY_REPOSITORY_PORT,
      useClass: PrismaServiceCategoryRepository,
    },
  ],
  // Supply needs the repository to validate vehicle attributes against the
  // category's polymorphic definitions; export the port to avoid duplicating
  // catalog reads inside supply.
  exports: [SERVICE_CATEGORY_REPOSITORY_PORT],
})
export class CatalogModule {}
