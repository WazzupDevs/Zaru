import { Global, Module } from "@nestjs/common";

import { PiiHasher } from "./pii-hasher";

@Global()
@Module({
  providers: [PiiHasher],
  exports: [PiiHasher],
})
export class SecurityModule {}
