import "ws";

declare module "ws" {
  interface ServerOptions {
    pingInterval?: number;
    pingTimeout?: number;
  }
}
