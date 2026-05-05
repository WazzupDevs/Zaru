import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { getLoggerToken, PinoLogger } from "nestjs-pino";

import { DISTANCE_CALCULATOR_PORT } from "./application/ports/distance-calculator.port";
import { PRICE_QUOTE_REPOSITORY_PORT } from "./application/ports/price-quote.repository.port";
import { PRICING_PROFILE_REPOSITORY_PORT } from "./application/ports/pricing-profile.repository.port";
import { PRICING_RULE_REPOSITORY_PORT } from "./application/ports/pricing-rule.repository.port";
import { CreatePricingRuleUseCase } from "./application/use-cases/create-pricing-rule.use-case";
import { DeactivatePricingRuleUseCase } from "./application/use-cases/deactivate-pricing-rule.use-case";
import { GetQuoteUseCase } from "./application/use-cases/get-quote.use-case";
import { ListActiveRulesUseCase } from "./application/use-cases/list-active-rules.use-case";
import { RequestPriceQuoteUseCase } from "./application/use-cases/request-price-quote.use-case";
import { UpsertPricingProfileUseCase } from "./application/use-cases/upsert-pricing-profile.use-case";
import { PricingCalculator } from "./domain/services/pricing-calculator.service";
import { RuleEvaluator } from "./domain/services/rule-evaluator.service";
import { GoogleMapsDistanceCalculator } from "./infrastructure/distance/google-maps-distance-calculator";
import { MockDistanceCalculator } from "./infrastructure/distance/mock-distance-calculator";
import { PrismaPriceQuoteRepository } from "./infrastructure/persistence/prisma-price-quote.repository";
import { PrismaPricingProfileRepository } from "./infrastructure/persistence/prisma-pricing-profile.repository";
import { PrismaPricingRuleRepository } from "./infrastructure/persistence/prisma-pricing-rule.repository";
import { PRICE_QUOTE_CLEANUP_QUEUE_NAME } from "./infrastructure/workers/price-quote-cleanup.constants";
import { PriceQuoteCleanupScheduler } from "./infrastructure/workers/price-quote-cleanup.scheduler";
import { PriceQuoteCleanupService } from "./infrastructure/workers/price-quote-cleanup.service";
import { PriceQuoteCleanupWorker } from "./infrastructure/workers/price-quote-cleanup.worker";
import { AdminPricingController } from "./interface/controllers/admin-pricing.controller";
import { PricingController } from "./interface/controllers/pricing.controller";

import type { Env } from "../../config/env";
import type { DistanceCalculatorPort } from "./application/ports/distance-calculator.port";

const GOOGLE_MAPS_LOGGER_TOKEN = getLoggerToken(GoogleMapsDistanceCalculator.name);

@Module({
  imports: [BullModule.registerQueue({ name: PRICE_QUOTE_CLEANUP_QUEUE_NAME })],
  controllers: [PricingController, AdminPricingController],
  providers: [
    PricingCalculator,
    RuleEvaluator,
    PriceQuoteCleanupService,
    PriceQuoteCleanupWorker,
    PriceQuoteCleanupScheduler,
    { provide: PRICING_PROFILE_REPOSITORY_PORT, useClass: PrismaPricingProfileRepository },
    { provide: PRICING_RULE_REPOSITORY_PORT, useClass: PrismaPricingRuleRepository },
    { provide: PRICE_QUOTE_REPOSITORY_PORT, useClass: PrismaPriceQuoteRepository },
    {
      provide: DISTANCE_CALCULATOR_PORT,
      useFactory: (
        config: ConfigService<Env, true>,
        logger: PinoLogger,
      ): DistanceCalculatorPort => {
        const apiKey = config.get("GOOGLE_MAPS_API_KEY", { infer: true });
        if (apiKey.startsWith("AIzaSy_DUMMY")) return new MockDistanceCalculator();
        return new GoogleMapsDistanceCalculator(config, logger);
      },
      inject: [ConfigService, GOOGLE_MAPS_LOGGER_TOKEN],
    },
    RequestPriceQuoteUseCase,
    GetQuoteUseCase,
    ListActiveRulesUseCase,
    UpsertPricingProfileUseCase,
    CreatePricingRuleUseCase,
    DeactivatePricingRuleUseCase,
  ],
  // Booking will use the quote repo to consume an ACTIVE quote (A4b).
  exports: [PRICE_QUOTE_REPOSITORY_PORT],
})
export class PricingModule {}
