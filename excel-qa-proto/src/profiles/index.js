/* 画像注册表：新增主题 = 放一个画像文件（+用例文件）+ 在此登记一行
 * main.js 按 ?theme=<id> 选择，缺省用 defaultTheme */
import { profile as retailSales } from './retail-sales.js';
import { retailCases } from './retail-cases.js';
import { profile as cigaretteSales } from './cigarette-sales.js';
import { cigaretteCases } from './cigarette-cases.js';

export const profiles = {
  [retailSales.id]: { profile: retailSales, cases: retailCases },
  [cigaretteSales.id]: { profile: cigaretteSales, cases: cigaretteCases },
};

export const defaultTheme = retailSales.id;
