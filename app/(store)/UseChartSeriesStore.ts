import { create } from 'zustand';

type ChartSeriesType = 'candlestick' | 'line' | 'bar' | 'area';

interface ChartSeriesState {
  selectedType: ChartSeriesType;
  setSelectedType: (type: ChartSeriesType) => void;
}

export const useChartSeriesStore = create<ChartSeriesState>((set) => ({
  selectedType: 'candlestick', 
  setSelectedType: (type : ChartSeriesType) => set({ selectedType: type }),
}));
