"use client";
import {createContext} from "react";
// A page-level recovery must not poll beneath the global offline cover.
export const OfflineCoverContext=createContext(false);
