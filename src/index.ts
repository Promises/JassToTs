import {JassParser} from "./jassParser";

let parser = new JassParser();
process.exit(parser.main(process.argv));