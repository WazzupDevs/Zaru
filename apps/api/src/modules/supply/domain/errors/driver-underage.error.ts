import { DomainError } from "../../../../common/errors/domain-error";

const MIN_DRIVER_AGE_YEARS = 18;

export class DriverUnderageError extends DomainError {
  readonly code = "SUPPLY_DRIVER_UNDERAGE";
  readonly httpStatus = 400;

  constructor(actualAge: number) {
    super(
      `Driver must be at least ${String(MIN_DRIVER_AGE_YEARS)} years old (was ${String(actualAge)}).`,
      {
        minAge: MIN_DRIVER_AGE_YEARS,
        actualAge,
      },
    );
  }
}
