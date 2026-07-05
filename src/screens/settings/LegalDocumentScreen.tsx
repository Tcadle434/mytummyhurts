import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StyleSheet, Text, View } from 'react-native';

import { AppScreen, ScreenHeader, SectionCard } from '../../components/common/UI';
import { legalDocuments } from '../../data/legal';
import { RootStackParamList } from '../../navigation/types';
import { spacing, tokens } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'LegalDocument'>;

export function LegalDocumentScreen({ route }: Props) {
  const document = legalDocuments[route.params.document];

  return (
    <AppScreen>
      <ScreenHeader eyebrow="Legal" title={document.title} />

      <View style={styles.sections}>
        {document.sections.map((section) => (
          <SectionCard key={section.heading}>
            <Text style={styles.sectionHeading}>{section.heading}</Text>
            <Text style={styles.sectionBody}>{section.body}</Text>
          </SectionCard>
        ))}
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  sections: {
    gap: spacing.md,
  },
  sectionHeading: {
    ...tokens.type.title.block,
    color: tokens.color.text.primary,
  },
  sectionBody: {
    ...tokens.type.body.default,
    color: tokens.color.text.secondary,
  },
});
