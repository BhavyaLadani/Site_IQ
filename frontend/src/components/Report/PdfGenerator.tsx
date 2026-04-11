import React from 'react';
import { Page, Text, View, Document, StyleSheet, Image, PDFDownloadLink } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: { flexDirection: 'column', backgroundColor: '#FFFFFF', padding: 30 },
  header: { fontSize: 24, marginBottom: 20, textAlign: 'center', color: '#111827' },
  section: { margin: 10, padding: 10, border: '1px solid #E5E7EB' },
  mapImage: { width: '100%', height: 300, marginBottom: 20 },
  score: { fontSize: 40, textAlign: 'center', color: '#059669', fontWeight: 'bold' }
});

interface ReportDocumentProps {
  scoreData: any;
  mapCanvasDataUrl: string; // Captured from maplibregl.Map.getCanvas().toDataURL()
}

// Dedicated PDF Template Document
const ReportDocument: React.FC<ReportDocumentProps> = ({ scoreData, mapCanvasDataUrl }) => (
  <Document>
    <Page size="A4" style={styles.page}>
      <Text style={styles.header}>Site Readiness Report</Text>
      
      {mapCanvasDataUrl && (
         <Image style={styles.mapImage} src={mapCanvasDataUrl} />
      )}

      <View style={styles.section}>
        <Text style={styles.score}>Composite Score: {scoreData.composite_score}</Text>
        <Text style={{ textAlign: 'center', fontSize: 14 }}>Grade: {scoreData.grade}</Text>
      </View>
      
      <View style={styles.section}>
        <Text style={{ fontSize: 16, marginBottom: 10 }}>Recommendation</Text>
        <Text style={{ fontSize: 12, lineHeight: 1.5 }}>
           {scoreData.recommendation}
        </Text>
      </View>
    </Page>
  </Document>
);

// Wrapper Link Button
export const PdfGeneratorButton: React.FC<ReportDocumentProps> = ({ scoreData, mapCanvasDataUrl }) => (
  <PDFDownloadLink
    document={<ReportDocument scoreData={scoreData} mapCanvasDataUrl={mapCanvasDataUrl} />}
    fileName={`Site_Report_${scoreData.site_id || 'export'}.pdf`}
    className="w-full py-3 mt-4 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded shadow transition-colors block text-center"
  >
    {({ loading }) => (loading ? 'Preparing Document...' : 'Download PDF Report')}
  </PDFDownloadLink>
);

export default PdfGeneratorButton;
