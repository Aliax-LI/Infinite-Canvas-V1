export interface AssetLibraryItem {
  id: string;
  name?: string;
  url?: string;
  kind?: string;
  type?: string;
  tags?: string[];
  caption?: string;
  classification?: {
    summary?: string;
    tags?: string[];
    categories?: Record<string, string[]>;
  };
}

export interface AssetLibraryCategory {
  id: string;
  name?: string;
  type?: string;
  dir?: string;
  items?: AssetLibraryItem[];
}

export interface AssetLibrary {
  id: string;
  name?: string;
  type?: string;
  categories?: AssetLibraryCategory[];
}

export interface AssetLibraryResponse {
  library?: {
    active_library_id?: string;
    libraries?: AssetLibrary[];
    categories?: AssetLibraryCategory[];
  };
}

export interface LocalAssetItem {
  id: string;
  name?: string;
  url?: string;
  kind?: string;
  file?: string;
}
