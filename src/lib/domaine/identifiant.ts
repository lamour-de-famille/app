/** Un id de document ne peut ni contenir « / », ni valoir « . » ou « .. », ni être de la forme « __x__ ». */
export function idDocumentValide(id: string): boolean {
  return id.length > 0 && id.length <= 1500 && !id.includes("/") && id !== "." && id !== ".." && !/^__.*__$/.test(id);
}
