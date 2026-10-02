#!/usr/bin/env node
import { runMain } from "citty";
import { mainCommand, showUsageWithBanner } from "./main-command.js";

await runMain(mainCommand, { showUsage: showUsageWithBanner });
