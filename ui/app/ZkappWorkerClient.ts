import { Field } from "o1js";
import * as Comlink from "comlink";

export default class ZkappWorkerClient {
  worker: Worker;
  remoteApi: Comlink.Remote<typeof import('./ZkappWorker').api>; 

  constructor() {
    const worker = new Worker(new URL('./zkappWorker.ts', import.meta.url), { type: 'module' });  
    this.remoteApi = Comlink.wrap(worker);
  }  

  async setActiveInstanceToDevnet() {
    return this.remoteApi.setActiveInstanceToDevnet();
  }

  async loadContract() {
    return this.remoteApi.loadContract();
  }

  async compileContract() {
    return this.remoteApi.compileContract();
  }

  async fetchAccount(publicKeyBase58: string) {
    return this.remoteApi.fetchAccount(publicKeyBase58);
  }

  async initZkappInstance(publicKeyBase58: string) {
    return this.remoteApi.initZkappInstance(publicKeyBase58);
  }

  async getResultsRoot(): Promise<string> {
    return this.remoteApi.getResultsRoot();
  }

  async castVote(candidateId: number) {
    return this.remoteApi.castVote(candidateId);
  }

  async proveTransaction() {
    return this.remoteApi.proveTransaction();
  }

  async getTransactionJSON() {
    return this.remoteApi.getTransactionJSON();
  }

  async createDeployTransaction(senderKey: string) {
    return this.remoteApi.createDeployTransaction(senderKey);
  }

  async fetchPendingVotes() {
      return this.remoteApi.fetchPendingVotes();
  }

  async processPendingVotes() {
      return this.remoteApi.processPendingVotes();
  }
}