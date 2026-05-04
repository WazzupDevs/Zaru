import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios, { type AxiosInstance } from "axios";
import { InjectPinoLogger, type PinoLogger } from "nestjs-pino";

import { DistanceCalculationFailedError } from "../../domain/errors/pricing-errors";

import type { Env } from "../../../../config/env";
import type {
  DistanceCalculationInput,
  DistanceCalculationResult,
  DistanceCalculatorPort,
} from "../../application/ports/distance-calculator.port";

interface GoogleApiResponse {
  status: string;
  rows?: {
    elements: {
      status: string;
      distance?: { value: number };
      duration?: { value: number };
      duration_in_traffic?: { value: number };
    }[];
  }[];
}

/**
 * Production adapter — calls Google Maps Distance Matrix API. Translates
 * upstream errors into a single domain error so use cases stay clean.
 * ADR 0018.
 */
@Injectable()
export class GoogleMapsDistanceCalculator implements DistanceCalculatorPort {
  private readonly client: AxiosInstance;
  private readonly apiKey: string;

  constructor(
    config: ConfigService<Env, true>,
    @InjectPinoLogger(GoogleMapsDistanceCalculator.name)
    private readonly logger: PinoLogger,
  ) {
    this.apiKey = config.get("GOOGLE_MAPS_API_KEY", { infer: true });
    this.client = axios.create({
      baseURL: "https://maps.googleapis.com/maps/api/distancematrix/json",
      timeout: 5000,
    });
  }

  async calculate(input: DistanceCalculationInput): Promise<DistanceCalculationResult> {
    let response;
    try {
      response = await this.client.get<GoogleApiResponse>("", {
        params: {
          origins: `${String(input.origin.lat)},${String(input.origin.lng)}`,
          destinations: `${String(input.destination.lat)},${String(input.destination.lng)}`,
          mode: input.mode ?? "driving",
          ...(input.departureTime !== undefined
            ? { departure_time: Math.floor(input.departureTime.getTime() / 1000) }
            : {}),
          key: this.apiKey,
        },
      });
    } catch (err) {
      this.logger.error({ err }, "Google Maps Distance Matrix request failed");
      throw new DistanceCalculationFailedError("Network or upstream error");
    }

    if (response.data.status !== "OK") {
      throw new DistanceCalculationFailedError(`api_status=${response.data.status}`);
    }
    const element = response.data.rows?.[0]?.elements[0];
    if (element?.status !== "OK" || !element.distance || !element.duration) {
      throw new DistanceCalculationFailedError(`element_status=${element?.status ?? "MISSING"}`);
    }

    const result: DistanceCalculationResult = {
      distanceKm: Math.round((element.distance.value / 1000) * 100) / 100,
      durationMinutes: Math.ceil(element.duration.value / 60),
    };
    if (element.duration_in_traffic) {
      result.durationInTrafficMinutes = Math.ceil(element.duration_in_traffic.value / 60);
    }
    return result;
  }
}
