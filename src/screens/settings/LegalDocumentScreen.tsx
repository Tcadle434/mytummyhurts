import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Text, View } from 'react-native';

import { AppScreen, ScreenHeader, SectionCard } from '../../components/common/UI';
import { legalDocuments } from '../../data/legal';
import { RootStackParamList } from '../../navigation/types';
import { palette, spacing, type } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'LegalDocument'>;

export function LegalDocumentScreen({ route }: Props) {
  const document = legalDocuments[route.params.document];

  return (
    <AppScreen>
      <ScreenHeader
        eyebrow="Legal"
        title={document.title}
        subtitle="This in-app copy is a product-ready draft until the hosted legal pages are finalized."
      />

      <View style={{ gap: spacing.md }}>
        {document.sections.map((section) => (
          <SectionCard key={section.heading}>
            <Text style={{ color: palette.text, fontFamily: type.body.bold, fontSize: 18 }}>{section.heading}</Text>
            <Text style={{ color: palette.textMuted, fontFamily: type.body.regular, fontSize: 14, lineHeight: 22 }}>
              {section.body}
            </Text>
          </SectionCard>
        ))}
      </View>
    </AppScreen>
  );
}
