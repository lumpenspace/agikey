export class BaseAdapter {
  constructor(providerInfo) {
    this.providerInfo = providerInfo;
    this.id = providerInfo.id;
    this.name = providerInfo.name;
    this.binaryPath = providerInfo.binaryPath;
  }

  async execute(_options) {
    throw new Error(`execute() not implemented for adapter ${this.id}`);
  }
}
